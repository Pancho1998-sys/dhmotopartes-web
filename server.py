import http.server
import socketserver
import os
import json

PORT = 8001
# Path to the POS database to keep stock synchronized
POS_DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'dhmotopartes', 'dhmotopartes_db.json'))
LOCAL_DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), 'dhmotopartes_db.json'))

class CustomHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Allow CORS for development testing
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        if self.path == '/api/db':
            db_path = POS_DB_PATH if os.path.exists(POS_DB_PATH) else LOCAL_DB_PATH
            
            if os.path.exists(db_path):
                self.send_response(200)
                self.send_header('Content-type', 'application/json; charset=utf-8')
                self.end_headers()
                try:
                    with open(db_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))
                except Exception as e:
                    self.send_error(500, f"Error reading database: {str(e)}")
            else:
                # If no database exists, return a mock empty database structure
                self.send_response(200)
                self.send_header('Content-type', 'application/json; charset=utf-8')
                self.end_headers()
                mock_db = {"products": [], "customers": [], "sales": [], "cashMovements": [], "settings": {"currency": "$"}}
                self.wfile.write(json.dumps(mock_db).encode('utf-8'))
        else:
            super().do_GET()

if __name__ == '__main__':
    # Ensure local directory is the working directory
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    # Try to copy POS database locally as a fallback on first load
    if os.path.exists(POS_DB_PATH) and not os.path.exists(LOCAL_DB_PATH):
        try:
            import shutil
            shutil.copy2(POS_DB_PATH, LOCAL_DB_PATH)
            print("Synchronized initial POS database to client catalog.")
        except Exception as e:
            print("Could not make initial DB copy:", e)

    handler = CustomHTTPRequestHandler
    # Allow port reuse to avoid 'Address already in use' errors
    socketserver.TCPServer.allow_reuse_address = True
    
    with socketserver.TCPServer(("", PORT), handler) as httpd:
        print(f"DH Motopartes Catalog Server running on port {PORT}")
        print(f"Access the client page at: http://localhost:{PORT}")
        print(f"Reading POS database from: {POS_DB_PATH if os.path.exists(POS_DB_PATH) else LOCAL_DB_PATH}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")
