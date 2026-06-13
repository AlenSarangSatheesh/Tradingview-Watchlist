# Unlimited Watchlists for TradingView

A Chrome side-panel extension that lets traders organize an unlimited number of
TradingView-style watchlists and jump straight to any symbol's chart on TradingView.

## Features

- **Unlimited Watchlists**: Create and manage as many watchlists as you like.
- **TradingView Integration**: Click a symbol to instantly open / switch its chart on TradingView.
- **Add from TradingView**: A floating "Add to Watchlist" button on TradingView pages lets you add the current symbol to any of your watchlists.
- **CSV Import**: Bulk-add symbols to a watchlist from a CSV file.
- **Chartink Import**: Import every stock from a [Chartink](https://chartink.com) screener into a watchlist named after that screener. Use the "Import to Watchlist" button on the screener page, or the "Import from Chartink" button in the side panel (paste the screener URL). Re-importing the same screener overwrites that watchlist's contents.
- **Search & Sort**: Filter symbols as you type, or sort a watchlist alphabetically (A–Z).
- **Drag & Drop**: Reorder watchlists with drag-and-drop.
- **Keyboard Shortcut**: Press `Space` to cycle to the next symbol in the active watchlist.
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
3.  **Add Stocks**: Use the CSV import button, the floating "Add to Watchlist" button on any TradingView page, or import a [Chartink](https://chartink.com) screener (see below).
4.  **Import from Chartink**: Open a Chartink screener and click the "Import to Watchlist" button on the page, or click "Import from Chartink" in the side panel and paste the screener URL. All matching stocks are imported into a watchlist named after the screener.
5.  **View Charts**: Click any symbol to open its chart on TradingView. Press `Space` to move to the next symbol.

## Permissions

This extension requires the following permissions:
- `storage`: To save your watchlists locally.
- `sidePanel`: To display the UI.
- `tabs`: To open and switch TradingView chart tabs, and to open a Chartink screener tab when importing.
- Host permissions for `tradingview.com` so the extension can update the chart symbol.
- Host permissions for `chartink.com` so the extension can read a screener's results when you import it.

Your watchlists are stored locally on your device. The only network requests the extension makes are to `chartink.com`, and only when you import a screener (to fetch that screener's stock list).

## Disclaimer

This project is provided as-is for personal use. Use at your own risk.
