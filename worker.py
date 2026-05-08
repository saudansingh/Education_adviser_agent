import asyncio
import os
from http.server import BaseHTTPRequestHandler, HTTPServer
import threading
from livekit.agents import WorkerOptions, cli
from agent import entrypoint 

# 1. ADD THIS: A tiny server to satisfy Cloud Run's port requirement
class HealthCheckHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"Agent is alive")

def run_health_check():
    server = HTTPServer(('0.0.0.0', 8080), HealthCheckHandler)
    server.serve_forever()

if __name__ == "__main__":
    # 2. Start the health check in a separate thread
    threading.Thread(target=run_health_check, daemon=True).start()
    
    # 3. Run the agent
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
