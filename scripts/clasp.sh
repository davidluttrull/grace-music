#!/bin/zsh
# clasp (Google's Apps Script command line tool), run through Deno so the Mac needs no Node.
#   scripts/clasp.sh login      # once: sign in with the account that owns the Sheet
#   scripts/clasp.sh status     # which files a push would send
exec deno run -A npm:@google/clasp@3.4.1 "$@"
