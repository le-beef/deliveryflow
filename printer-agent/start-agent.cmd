@echo off
start "DeliveryFlow Print Agent" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0DeliveryFlow.PrintAgent.ps1"
