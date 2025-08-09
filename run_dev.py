#!/usr/bin/env python3
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))

def run(cmd, cwd=None):
    return subprocess.Popen(cmd, cwd=cwd or ROOT)

def main():
    try:
        subprocess.check_call(["node", "-v"])
        subprocess.check_call(["npm", "-v"])
    except Exception:
        print("Node.js and npm are required. Please install them first.")
        sys.exit(1)

    subprocess.check_call(["npm", "run", "build"], cwd=os.path.join(ROOT, "backend"))

    p1 = run(["npm", "run", "start:dev"], cwd=os.path.join(ROOT, "backend"))
    p2 = run(["npm", "run", "dev"], cwd=os.path.join(ROOT, "frontend"))

    try:
        p1.wait()
        p2.wait()
    finally:
        for p in (p1, p2):
            try:
                p.terminate()
            except Exception:
                pass

if __name__ == "__main__":
    main()