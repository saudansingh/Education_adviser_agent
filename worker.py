import asyncio
import os
from fastapi import FastAPI
import uvicorn
from livekit.agents import WorkerOptions, WorkerType, worker
from agent import entrypoint  # Your agent logic

app = FastAPI()

# 1. The "Health Check" Google Cloud Run is looking for
@app.get("/")
async def health_check():
    return {"status": "worker_alive"}

# 2. The function that actually starts the LiveKit Agent
async def start_agent():
    opts = WorkerOptions(
        entrypoint_fnc=entrypoint,
        worker_type=WorkerType.ROOM # Standard for voice agents
    )
    print("LOG: Registering worker with LiveKit Cloud...")
    await worker.run(opts)

# 3. Tell FastAPI to start the agent in the background when the app turns on
@app.on_event("startup")
async def startup_event():
    # asyncio.create_task is the secret—it runs the agent 
    # without stopping the web server from answering Google
    asyncio.create_task(start_agent())
    print("LOG: Agent background task scheduled.")

if __name__ == "__main__":
    # Get the port from environment (Cloud Run uses 8080)
    port = int(os.environ.get("PORT", 8080))
    # Start the web server
    uvicorn.run(app, host="0.0.0.0", port=port)
