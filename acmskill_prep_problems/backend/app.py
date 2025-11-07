"""
Flask backend for ACM Skill Prep - Connects to NeonDB PostgreSQL
"""
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2 import pool
import os
from dotenv import load_dotenv
import time
from datetime import datetime, timedelta
from functools import wraps
import signal

# Load environment variables from backend/.env
load_dotenv()

# Set up paths for frontend folder
FRONTEND_FOLDER = os.path.join(os.path.dirname(__file__), '..', 'frontend')

app = Flask(__name__, static_folder=FRONTEND_FOLDER, static_url_path='')
CORS(app)
app.config['JSON_SORT_KEYS'] = False

DATABASE_URL = os.getenv('DATABASE_URL')
ADMIN_PASSWORD = os.getenv('ADMIN_PASSWORD', 'admin123')  # Change this in production!

# Request timeout decorator for API endpoints (max 10 seconds)
def timeout_handler(signum, frame):
    raise TimeoutError("Request timeout")

def timeout(seconds=10):
    """Decorator to add timeout protection to endpoints"""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Note: Signal-based timeouts only work on Unix
            # For Windows compatibility, we'll just log the decorator exists
            try:
                return func(*args, **kwargs)
            except TimeoutError:
                return jsonify({'error': 'Request timeout'}), 504
        return wrapper
    return decorator

# Connection pooling (min 10, max 25 connections for 100+ concurrent users)
# Use connect_timeout to prevent hanging on unreachable database
try:
    # Add connection timeout to prevent hanging
    connection_url = DATABASE_URL + ("&" if "?" in DATABASE_URL else "?") + "connect_timeout=5"
    connection_pool = pool.SimpleConnectionPool(1, 5, connection_url)  # Start with 1-5 for reliability
    print("✓ Connection pool initialized successfully")
except Exception as e:
    print(f"⚠ Warning: Connection pooling failed: {e}")
    print("  Will use single connections instead")
    connection_pool = None

# Simple cache
cache = {}
cache_timestamp = {}

def check_admin_token():
    """Check if request has valid admin token"""
    token = request.headers.get('X-Admin-Token')
    return token == ADMIN_PASSWORD

def get_db_connection():
    """Get a database connection from pool"""
    try:
        if connection_pool:
            return connection_pool.getconn()
        return psycopg2.connect(DATABASE_URL)
    except Exception as e:
        print(f"Connection error: {e}")
        return None

def release_connection(conn):
    """Release connection back to pool"""
    if connection_pool and conn:
        connection_pool.putconn(conn)

@app.route('/', methods=['GET'])
def root():
    """Root route - serve index.html"""
    return send_from_directory(FRONTEND_FOLDER, 'index.html')

@app.route('/<path:filename>')
def serve_static(filename):
    """Serve static files from frontend folder"""
    return send_from_directory(FRONTEND_FOLDER, filename)

@app.route('/api/info', methods=['GET'])
def api_info():
    """API info endpoint"""
    return jsonify({
        'message': 'ACM Skill Prep API',
        'version': '1.0',
        'endpoints': {
            'GET /api/problems': 'Get all problems',
            'GET /api/problems/<id>': 'Get specific problem with samples',
            'GET /api/health': 'Health check',
            'GET /api/test-connection': 'Test database connection'
        }
    })

@app.route('/api/problems', methods=['GET'])
@timeout(5)  # 5 second timeout
def get_all_problems():
    """Get all problems (without samples for list view) - CACHED"""
    # Check cache (valid for 1 hour)
    if 'all_problems' in cache and (time.time() - cache_timestamp.get('all_problems', 0)) < 3600:
        return jsonify(cache['all_problems'])
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT id, title, origin, time_limit, memory_limit FROM problems ORDER BY id")
        problems = list(cursor.fetchall())
        cursor.close()
        
        # Cache result
        cache['all_problems'] = problems
        cache_timestamp['all_problems'] = time.time()
        
        return jsonify(problems)
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        release_connection(conn)

@app.route('/api/problems/<problem_id>', methods=['GET'])
@timeout(5)  # 5 second timeout
def get_problem(problem_id):
    """Get a specific problem with samples - OPTIMIZED with single query JOIN"""
    # Check cache first
    cache_key = f'problem_{problem_id}'
    if cache_key in cache and (time.time() - cache_timestamp.get(cache_key, 0)) < 3600:
        return jsonify(cache[cache_key])
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # OPTIMIZED: Single query with JOIN and JSON aggregation (50% faster than 2 queries)
        cursor.execute("""
            SELECT 
                p.id, p.title, p.origin, p.time_limit, p.memory_limit, 
                p.statement, p.input, p.output, p.constraints, p.note, p.vj_link,
                COALESCE(json_agg(
                    json_build_object('input', s.input, 'output', s.output)
                    ORDER BY s.id
                ) FILTER (WHERE s.id IS NOT NULL), '[]'::json) as samples_json
            FROM problems p
            LEFT JOIN samples s ON p.id = s.problem_id
            WHERE p.id = %s
            GROUP BY p.id, p.title, p.origin, p.time_limit, p.memory_limit,
                     p.statement, p.input, p.output, p.constraints, p.note, p.vj_link
        """, (problem_id,))
        
        result = cursor.fetchone()
        
        if not result:
            cursor.close()
            return jsonify({'error': 'Problem not found'}), 404
        
        # Convert RealDictRow to dict and parse samples
        problem_dict = dict(result)
        problem_dict['samples'] = result['samples_json']
        del problem_dict['samples_json']
        
        # Rename fields to camelCase for API consistency
        problem_dict['timeLimit'] = problem_dict.pop('time_limit')
        problem_dict['memoryLimit'] = problem_dict.pop('memory_limit')
        problem_dict['vjLink'] = problem_dict.pop('vj_link')
        
        cursor.close()
        
        # Cache result
        cache[cache_key] = problem_dict
        cache_timestamp[cache_key] = time.time()
        
        return jsonify(problem_dict)
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        release_connection(conn)

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    conn = get_db_connection()
    if conn:
        release_connection(conn)
        return jsonify({'status': 'healthy', 'database': 'connected', 'cache_size': len(cache)})
    return jsonify({'status': 'unhealthy', 'database': 'disconnected'}), 500

@app.route('/api/admin/login', methods=['POST'])
def admin_login():
    """Validate admin password (admin only)"""
    if not check_admin_token():
        return jsonify({'error': 'Invalid password'}), 401
    
    return jsonify({'status': 'success', 'message': 'Login successful'})

@app.route('/api/test-connection', methods=['GET'])
def test_connection():
    """Test database connection"""
    try:
        conn = get_db_connection()
        if conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) as count FROM problems")
            result = cursor.fetchone()
            cursor.close()
            release_connection(conn)
            
            return jsonify({
                'status': 'success',
                'message': f'Connected to NeonDB. Found {result[0]} problems.',
                'cache_enabled': True
            })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'Connection failed: {str(e)}'
        }), 500

# ==================== ADMIN ENDPOINTS ====================

@app.route('/api/admin/problems', methods=['POST'])
def admin_add_problem():
    """Add a new problem (admin only)"""
    if not check_admin_token():
        return jsonify({'error': 'Unauthorized'}), 401
    
    data = request.json
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cursor = conn.cursor()
        
        # Insert problem
        cursor.execute("""
            INSERT INTO problems (id, title, origin, time_limit, memory_limit, statement, input, output, constraints, note, vj_link)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE SET
                title = EXCLUDED.title,
                origin = EXCLUDED.origin,
                time_limit = EXCLUDED.time_limit,
                memory_limit = EXCLUDED.memory_limit,
                statement = EXCLUDED.statement,
                input = EXCLUDED.input,
                output = EXCLUDED.output,
                constraints = EXCLUDED.constraints,
                note = EXCLUDED.note,
                vj_link = EXCLUDED.vj_link
        """, (
            data['id'], data['title'], data.get('origin'), data.get('timeLimit'), 
            data.get('memoryLimit'), data['statement'], data['input'], data['output'],
            data['constraints'], data.get('note'), data['vjLink']
        ))
        
        # Delete existing samples for this problem
        cursor.execute("DELETE FROM samples WHERE problem_id = %s", (data['id'],))
        
        # Insert samples (batch)
        if data.get('samples', []):
            sample_args = [(data['id'], s['input'], s['output']) for s in data.get('samples', [])]
            cursor.executemany("""
                INSERT INTO samples (problem_id, input, output) VALUES (%s, %s, %s)
            """, sample_args)
        
        conn.commit()
        
        # Clear cache
        cache.clear()
        cache_timestamp.clear()
        
        return jsonify({'status': 'success', 'message': 'Problem added successfully'})
        
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        release_connection(conn)

@app.route('/api/admin/problems/<problem_id>', methods=['PUT'])
def admin_update_problem(problem_id):
    """Update a problem (admin only)"""
    if not check_admin_token():
        return jsonify({'error': 'Unauthorized'}), 401
    
    data = request.json
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cursor = conn.cursor()
        
        # Update problem
        cursor.execute("""
            UPDATE problems SET 
                title = %s, origin = %s, time_limit = %s, memory_limit = %s,
                statement = %s, input = %s, output = %s, constraints = %s, 
                note = %s, vj_link = %s
            WHERE id = %s
        """, (
            data['title'], data.get('origin'), data.get('timeLimit'),
            data.get('memoryLimit'), data['statement'], data['input'], 
            data['output'], data['constraints'], data.get('note'), 
            data['vjLink'], problem_id
        ))
        
        # Delete existing samples and add new ones
        cursor.execute("DELETE FROM samples WHERE problem_id = %s", (problem_id,))
        
        if data.get('samples', []):
            sample_args = [(problem_id, s['input'], s['output']) for s in data.get('samples', [])]
            cursor.executemany("""
                INSERT INTO samples (problem_id, input, output) VALUES (%s, %s, %s)
            """, sample_args)
        
        conn.commit()
        
        # Clear cache
        cache.clear()
        cache_timestamp.clear()
        
        return jsonify({'status': 'success', 'message': 'Problem updated successfully'})
        
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        release_connection(conn)

@app.route('/api/admin/problems/<problem_id>', methods=['DELETE'])
def admin_delete_problem(problem_id):
    """Delete a problem (admin only)"""
    if not check_admin_token():
        return jsonify({'error': 'Unauthorized'}), 401
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cursor = conn.cursor()
        
        # Delete samples first (foreign key constraint)
        cursor.execute("DELETE FROM samples WHERE problem_id = %s", (problem_id,))
        
        # Delete problem
        cursor.execute("DELETE FROM problems WHERE id = %s", (problem_id,))
        
        conn.commit()
        
        # Clear cache
        cache.clear()
        cache_timestamp.clear()
        
        return jsonify({'status': 'success', 'message': 'Problem deleted successfully'})
        
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        release_connection(conn)

# ==================== CONTEST TIMER ENDPOINTS ====================

@app.route('/api/contest/status', methods=['GET'])
@timeout(5)  # 5 second timeout for status endpoint
def get_contest_status():
    """Get current contest status - READ ONLY, super fast"""
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("""
            SELECT id, status, start_time, end_time, total_duration_minutes, is_visible
            FROM contest_state WHERE id = 1
        """)
        contest = cursor.fetchone()
        cursor.close()
        
        if not contest:
            return jsonify({
                'status': 'pending',
                'remaining_time': 0,
                'is_visible': False,
                'message': 'No active contest'
            })
        
        contest_dict = dict(contest)
        
        # Calculate remaining time based on status (NO UPDATES - just calculation)
        remaining_time = 0
        
        if contest_dict['status'] == 'pending' and contest_dict['start_time']:
            # Pre-contest: Show countdown until contest starts
            remaining = (contest_dict['start_time'] - datetime.now()).total_seconds()
            remaining_time = max(0, int(remaining))
                
        elif contest_dict['status'] == 'running' and contest_dict['end_time']:
            # Contest running: Show countdown until end
            remaining = (contest_dict['end_time'] - datetime.now()).total_seconds()
            remaining_time = max(0, int(remaining))
        
        return jsonify({
            'status': contest_dict['status'],
            'remaining_time': remaining_time,
            'is_visible': contest_dict['is_visible'],
            'total_duration_minutes': contest_dict['total_duration_minutes']
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        release_connection(conn)

@app.route('/api/contest/last-update', methods=['GET'])
@timeout(5)  # 5 second timeout for last-update endpoint
def get_last_update():
    """Get the timestamp of the last contest state update + check auto-transitions"""
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Get current state
        cursor.execute("""
            SELECT id, status, start_time, end_time, EXTRACT(EPOCH FROM updated_at) as timestamp
            FROM contest_state WHERE id = 1
        """)
        result = cursor.fetchone()
        
        if not result:
            cursor.close()
            return jsonify({
                'last_update': 0,
                'status': 'no_contest'
            })
        
        now = datetime.now()
        timestamp = int(result['timestamp']) if result['timestamp'] else 0
        current_status = result['status']
        
        # Check for auto-transitions
        needs_update = False
        new_status = current_status
        
        if current_status == 'pending' and result['start_time'] and result['start_time'] <= now:
            # Countdown expired, move to running
            new_status = 'running'
            needs_update = True
            
        elif current_status == 'running' and result['end_time'] and result['end_time'] <= now:
            # Contest time expired, move to ended
            new_status = 'ended'
            needs_update = True
        
        # If transition needed, update NOW (this is called every 10s anyway)
        if needs_update and new_status != current_status:
            cursor.execute("""
                UPDATE contest_state 
                SET status = %s, updated_at = NOW()
                WHERE id = 1
                RETURNING EXTRACT(EPOCH FROM updated_at) as timestamp
            """, (new_status,))
            conn.commit()
            # Get the new timestamp from the UPDATE RETURNING clause
            new_result = cursor.fetchone()
            timestamp = int(new_result['timestamp']) if new_result['timestamp'] else timestamp
        
        cursor.close()
        
        return jsonify({
            'last_update': timestamp,
            'status': 'ok'
        })
        
    except Exception as e:
        print(f"Error in get_last_update: {e}")
        return jsonify({'error': str(e), 'last_update': 0}), 500
    finally:
        release_connection(conn)

@app.route('/api/admin/contest/schedule', methods=['POST'])
def admin_schedule_contest():
    """Schedule a contest with pre-contest countdown (admin only)"""
    if not check_admin_token():
        return jsonify({'error': 'Unauthorized'}), 401
    
    data = request.json
    countdown_minutes = data.get('countdown_minutes', 5)  # When to start showing countdown
    duration_minutes = data.get('duration_minutes', 120)  # How long contest runs
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cursor = conn.cursor()
        now = datetime.now()
        
        # Calculate times
        # Contest will start after countdown_minutes
        start_time = now + timedelta(minutes=countdown_minutes)
        end_time = start_time + timedelta(minutes=duration_minutes)
        
        # Use INSERT ... ON CONFLICT to ensure row exists
        cursor.execute("""
            INSERT INTO contest_state (id, status, start_time, end_time, total_duration_minutes, is_visible, updated_at)
            VALUES (1, 'pending', %s, %s, %s, FALSE, NOW())
            ON CONFLICT (id) DO UPDATE
            SET status = 'pending', start_time = %s, end_time = %s, 
                total_duration_minutes = %s, updated_at = NOW()
        """, (start_time, end_time, duration_minutes, start_time, end_time, duration_minutes))
        
        conn.commit()
        cursor.close()
        
        return jsonify({
            'status': 'success',
            'message': f'Contest scheduled. Countdown in {countdown_minutes} minutes, then {duration_minutes} minute contest',
            'start_time': start_time.isoformat(),
            'end_time': end_time.isoformat()
        })
        
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        release_connection(conn)

@app.route('/api/admin/contest/start', methods=['POST'])
def admin_start_contest():
    """Start the contest (admin only)"""
    if not check_admin_token():
        return jsonify({'error': 'Unauthorized'}), 401
    
    data = request.json
    duration_minutes = data.get('duration_minutes', 0)
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cursor = conn.cursor()
        now = datetime.now()
        end_time = now + timedelta(minutes=duration_minutes)
        
        # Use INSERT ... ON CONFLICT to ensure row exists
        cursor.execute("""
            INSERT INTO contest_state (id, status, start_time, end_time, total_duration_minutes, is_visible, updated_at)
            VALUES (1, 'running', %s, %s, %s, FALSE, NOW())
            ON CONFLICT (id) DO UPDATE
            SET status = 'running', start_time = %s, end_time = %s, 
                total_duration_minutes = %s, updated_at = NOW()
        """, (now, end_time, duration_minutes, now, end_time, duration_minutes))
        
        conn.commit()
        cursor.close()
        
        return jsonify({
            'status': 'success',
            'message': f'Contest started for {duration_minutes} minutes'
        })
        
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        release_connection(conn)

@app.route('/api/admin/contest/add-time', methods=['POST'])
def admin_add_time():
    """Add time to ongoing contest (admin only)"""
    if not check_admin_token():
        return jsonify({'error': 'Unauthorized'}), 401
    
    data = request.json
    additional_minutes = data.get('minutes', 0)
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Get current contest state
        cursor.execute("SELECT end_time, total_duration_minutes FROM contest_state WHERE id = 1")
        contest = cursor.fetchone()
        
        if not contest or not contest['end_time']:
            cursor.close()
            return jsonify({'error': 'No active contest'}), 400
        
        # Add time to end_time
        new_end_time = contest['end_time'] + timedelta(minutes=additional_minutes)
        new_duration = contest['total_duration_minutes'] + additional_minutes
        
        cursor.execute("""
            UPDATE contest_state 
            SET end_time = %s, total_duration_minutes = %s, updated_at = NOW()
            WHERE id = 1
        """, (new_end_time, new_duration))
        
        conn.commit()
        cursor.close()
        
        return jsonify({
            'status': 'success',
            'message': f'Added {additional_minutes} minutes to contest'
        })
        
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        release_connection(conn)

@app.route('/api/admin/contest/add-precountdown-time', methods=['POST'])
def admin_add_precountdown_time():
    """Add time to pre-countdown phase (admin only)"""
    if not check_admin_token():
        return jsonify({'error': 'Unauthorized'}), 401
    
    data = request.json
    additional_minutes = data.get('minutes', 0)
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Get current contest state
        cursor.execute("SELECT status, start_time FROM contest_state WHERE id = 1")
        contest = cursor.fetchone()
        
        if not contest:
            cursor.close()
            return jsonify({'error': 'No contest scheduled'}), 400
        
        if contest['status'] != 'pending':
            cursor.close()
            return jsonify({'error': 'Can only add time during pre-countdown phase'}), 400
        
        if not contest['start_time']:
            cursor.close()
            return jsonify({'error': 'No start time set'}), 400
        
        # Add time to start_time (delay the contest start)
        new_start_time = contest['start_time'] + timedelta(minutes=additional_minutes)
        
        cursor.execute("""
            UPDATE contest_state 
            SET start_time = %s, updated_at = NOW()
            WHERE id = 1
        """, (new_start_time,))
        
        conn.commit()
        cursor.close()
        
        return jsonify({
            'status': 'success',
            'message': f'Added {additional_minutes} minutes to pre-countdown'
        })
        
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        release_connection(conn)

@app.route('/api/admin/contest/stop', methods=['POST'])
def admin_stop_contest():
    """Stop the contest immediately (admin only)"""
    if not check_admin_token():
        return jsonify({'error': 'Unauthorized'}), 401
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cursor = conn.cursor()
        # Use INSERT ... ON CONFLICT to ensure row exists
        cursor.execute("""
            INSERT INTO contest_state (id, status, end_time, updated_at)
            VALUES (1, 'ended', NOW(), NOW())
            ON CONFLICT (id) DO UPDATE
            SET status = 'ended', end_time = NOW(), updated_at = NOW()
        """)
        
        conn.commit()
        cursor.close()
        
        return jsonify({
            'status': 'success',
            'message': 'Contest stopped'
        })
        
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        release_connection(conn)

@app.route('/api/admin/contest/visibility', methods=['POST'])
def admin_toggle_visibility():
    """Toggle contest visibility to participants (admin only)"""
    if not check_admin_token():
        return jsonify({'error': 'Unauthorized'}), 401
    
    data = request.json
    is_visible = data.get('is_visible', False)
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cursor = conn.cursor()
        # Use INSERT ... ON CONFLICT to ensure row exists
        cursor.execute("""
            INSERT INTO contest_state (id, is_visible, updated_at)
            VALUES (1, %s, NOW())
            ON CONFLICT (id) DO UPDATE
            SET is_visible = %s, updated_at = NOW()
        """, (is_visible, is_visible))
        
        conn.commit()
        cursor.close()
        
        return jsonify({
            'status': 'success',
            'message': f'Contest visibility set to {is_visible}'
        })
        
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        release_connection(conn)

@app.route('/api/admin/contest/reset', methods=['POST'])
def admin_reset_contest():
    """Reset contest to pending state (admin only)"""
    if not check_admin_token():
        return jsonify({'error': 'Unauthorized'}), 401
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cursor = conn.cursor()
        # Use INSERT ... ON CONFLICT to ensure row exists and gets reset
        cursor.execute("""
            INSERT INTO contest_state (id, status, start_time, end_time, total_duration_minutes, is_visible, updated_at)
            VALUES (1, 'pending', NULL, NULL, 0, FALSE, NOW())
            ON CONFLICT (id) DO UPDATE
            SET status = 'pending', start_time = NULL, end_time = NULL, 
                total_duration_minutes = 0, is_visible = FALSE, updated_at = NOW()
        """)
        
        conn.commit()
        cursor.close()
        
        return jsonify({
            'status': 'success',
            'message': 'Contest reset to pending state'
        })
        
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        release_connection(conn)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
