#!/usr/bin/env python3
import asyncio
import os
from dotenv import load_dotenv
from livekit.agents import cli

load_dotenv(".env.local")

if __name__ == "__main__":
    # Run agent worker
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
