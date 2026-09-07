git pull --rebase origin main
pause
git add .
git push -u origin main
set /p choice=Name a commit:
git commit -m "%choice%"