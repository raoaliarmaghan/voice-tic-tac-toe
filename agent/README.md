# Agent configuration

- `prompt.md` is the **improved prompt for the standalone app**; it preserves the voice double-action flow of the course while enforcing validation in the client.
- `actions.json` preserves the **six actions** from the supplied Vocal Bridge Lesson 2 files (`show_tic_tac_toe`, `user_move`, `place_mark`, `clear_ui`, `user_placed_mark`, `board_sync`).
- `course-prompt-original.md` preserves the uploaded course prompt for comparison. It orders both actions in one voice response. The frontend rejects out-of-turn, occupied and invalid actions, but the agent may still attempt an invalid counter-move.

The React application expects row/col values **zero-based 0–2**, and publishes **null** for empty board squares. The backend is only for token minting; game moves never go through FastAPI.
