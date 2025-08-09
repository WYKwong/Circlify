#!/usr/bin/env python3
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))

def run(cmd, cwd=None):
    print("$", *cmd)
    subprocess.check_call(cmd, cwd=cwd or ROOT)

def main():
    try:
        run(["node", "-v"])
        run(["npm", "-v"])
    except Exception:
        print("Node.js and npm are required. Please install them first.")
        sys.exit(1)

    run(["npm", "install"], cwd=os.path.join(ROOT, "backend"))
    run(["npm", "install"], cwd=os.path.join(ROOT, "frontend"))
    print("\nAll dependencies installed successfully.")

if __name__ == "__main__":
    main()