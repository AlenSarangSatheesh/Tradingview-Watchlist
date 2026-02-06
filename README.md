# TradingView Unlimited Watchlists and Price Alerts

A Chrome Extension that provides a powerful side panel watchlist for traders, featuring real-time stock prices, unlimited watchlists, and price alerts.

## Features

- **Unlimited Watchlists**: Create and manage multiple watchlists with ease.
- **Real-time Prices**: Fetches live stock prices using Yahoo Finance API.
- **Price Alerts**: Set price alerts with audio and system notifications. 
  - Supports "Cross Price" alerts.
  - Background monitoring via offscreen documents.
- **TradingView Integration**: Click on a stock to instantly open its chart on TradingView.
- **CSV Import**: Easily import your watchlists via CSV files.
- **Drag & Drop**: Reorder your watchlists and stocks with drag-and-drop functionality.
- **Side Panel Interface**: Conveniently accessible from the browser side panel.

## Installation

1.  Clone or download this repository.
2.  Open Chrome and navigate to `chrome://extensions/`.
3.  Enable **Developer mode** in the top right corner.
4.  Click **Load unpacked**.
5.  Select the directory containing this project.

## Usage

1.  Open the extension from the Chrome side panel.
2.  **Create Watchlist**: Click the "New" button to create a watchlist.
3.  **Add Stocks**: Use the CSV import feature to bulk add stocks.
4.  **Set Alerts**: Click the alarm icon next to a stock or use the context menu on TradingView pages to set alerts.
5.  **View Charts**: Click on any stock symbol to open the corresponding TradingView chart.

## Permissions

This extension requires the following permissions:
- `storage`: To save watchlists and alerts.
- `sidePanel`: To display the UI.
- `alarms` & `notifications`: For price alerts.
- `offscreen`: To play audio in the background.
- `activeTab` & `tabs`: To interact with TradingView tabs.
- Host permissions for `yahoo.com` and `tradingview.com`.

## Disclaimer

This project is for educational purposes only. Stock prices may have a delay. Use at your own risk.
