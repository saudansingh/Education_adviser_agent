import asyncio
import os
import sys
from fastapi import FastAPI
import uvicorn

# Try-except around LiveKit imports to catch missing library errors
try:
    from livekit.agents import WorkerOptions, WorkerType, worker
    from agent import entrypoint
    print("LOG: Imports successful.")
except Exception as e:
    print(f"CRITICAL ERROR DURING IMPORTS: {e}")
    sys.exit(1)

app = FastAPI()

@app.get("/")
async def health_check():
    return {"status": "worker_alive", "agent": "connected"}

async def start_agent():
    print("LOG: Entering start_agent function...")
    try:
        opts = WorkerOptions(
            entrypoint_fnc=entrypoint,
            worker_type=WorkerType.ROOM
        )
        print("LOG: Attempting to register with LiveKit Cloud...")
        # This is the line that connects to your LiveKit URL/Keys
        await worker.run(opts)
    except Exception as e:
        print(f"AGENT WORKER ERROR: {e}")

@app.on_event("startup")
async def startup_event():
    print("LOG: FastAPI Startup Event Triggered")
    # This runs the agent in the background
    asyncio.create_task(start_agent())
    print("LOG: Agent background task has been scheduled.")

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    print(f"LOG: Starting Uvicorn on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)
