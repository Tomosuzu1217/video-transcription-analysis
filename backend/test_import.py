import sys
print("Python:", sys.executable)
print("Testing imports...")

print("1. Config...", end=" ", flush=True)
from app.config import settings
print("OK")

print("2. Database...", end=" ", flush=True)
from app.database import engine, Base
print("OK")

print("3. Models...", end=" ", flush=True)
from app.models import Video
print("OK")

print("4. Routers...", end=" ", flush=True)
from app.routers import videos
print("OK")

print("\nAll imports successful!")
print("Starting uvicorn...")
