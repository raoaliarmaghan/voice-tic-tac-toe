#!/usr/bin/env bash
# Update the game on the portfolio server (served at aliarmaghan.com/tic-tac-toe/).
# Run on the server from anywhere:  ~/voice-tic-tac-toe/deploy.sh
set -e
cd ~/voice-tic-tac-toe
git pull
backend/.venv/bin/pip install -q -r backend/requirements.txt
(cd frontend && npm ci --silent && npm run build:portfolio)
sudo systemctl restart tictactoe-api
sudo systemctl status tictactoe-api --no-pager | grep Active
