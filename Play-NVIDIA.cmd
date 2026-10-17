@echo off
setlocal
set "AFTERBURN_CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%AFTERBURN_CHROME%" set "AFTERBURN_CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%AFTERBURN_CHROME%" set "AFTERBURN_CHROME=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
if not exist "%AFTERBURN_CHROME%" (
    echo Google Chrome was not found. Install Chrome to use this launcher.
    pause
    exit /b 1
)
set "AFTERBURN_GAME=%~dp0afterburn-orbital-assault.html"
if not exist "%AFTERBURN_GAME%" (
    echo Keep this launcher in the same folder as afterburn-orbital-assault.html.
    pause
    exit /b 1
)
set "AFTERBURN_URL=file:///%AFTERBURN_GAME:\=/%"
start "" /max "%AFTERBURN_CHROME%" --user-data-dir="%LOCALAPPDATA%\AfterburnOrbitalAssault\Chrome" --force-high-performance-gpu --no-first-run --no-default-browser-check --start-maximized --app="%AFTERBURN_URL%"
endlocal
