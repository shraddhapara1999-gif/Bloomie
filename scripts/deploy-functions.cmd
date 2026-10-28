@echo off
rem Deploy Bloomie's Supabase Edge Functions and set their configuration.
rem Requires `npx supabase login` and `npx supabase link` first.
rem Usage: scripts\deploy-functions.cmd [app-url]     (default http://localhost:5173)
setlocal
set "APP_URL=%~1"
if "%APP_URL%"=="" set "APP_URL=http://localhost:5173"

call npx supabase functions deploy delete-account --use-api || exit /b 1
call npx supabase functions deploy ai-journal-prompt --use-api || exit /b 1
call npx supabase functions deploy send-reminders --no-verify-jwt --use-api || exit /b 1
call npx supabase functions deploy unsubscribe --no-verify-jwt --use-api || exit /b 1

rem Reuse the existing cron secret if one was generated before, otherwise create one.
if exist "supabase\.cron-secret" (
  set /p CRON_SECRET=<"supabase\.cron-secret"
) else (
  for /f %%s in ('node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"') do set "CRON_SECRET=%%s"
)
> "supabase\.cron-secret" echo %CRON_SECRET%

rem Always allow local development alongside the given app URL.
set "ORIGINS=%APP_URL%"
if /i not "%APP_URL%"=="http://localhost:5173" set "ORIGINS=%APP_URL%,http://localhost:5173"

call npx supabase secrets set "APP_URL=%APP_URL%" "ALLOWED_ORIGINS=%ORIGINS%" "CRON_SECRET=%CRON_SECRET%" || exit /b 1

echo.
echo Functions deployed. APP_URL=%APP_URL%  ALLOWED_ORIGINS=%ORIGINS%
echo The cron secret is saved in supabase\.cron-secret (git-ignored) for the scheduler setup.
