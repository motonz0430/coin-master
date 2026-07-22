# Project recovery and backup

The durable Cocos Creator project lives at:

`/Users/Martin/Documents/coin-flick-game`

Do not move the only working copy into `.codex/.chatgpt-projects`; those directories are disposable task mirrors.

Every Git commit refreshes the independent bundle at:

`/Users/Martin/Documents/coin-flick-game-backups/coin-flick-game-latest.bundle`

To restore from that bundle:

```sh
git clone /Users/Martin/Documents/coin-flick-game-backups/coin-flick-game-latest.bundle coin-flick-game
```
