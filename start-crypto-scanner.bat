@echo off
rem Research only. Opens the crypto alert scanner. It does not place orders.
cd /d "%~dp0"
title Crypto Scanner
call npm run crypto:loop
