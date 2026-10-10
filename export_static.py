#!/usr/bin/env python3
"""Alias for build_snapshot.py — writes dist/fridge-board-snapshot.html."""
import runpy
import os
runpy.run_path(os.path.join(os.path.dirname(os.path.abspath(__file__)), "build_snapshot.py"), run_name="__main__")
