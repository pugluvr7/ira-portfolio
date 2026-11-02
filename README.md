# IRA Portfolio

A simple, zero-dependency dashboard for an IRA account: total value, gains, annual
contribution progress, value-over-time chart, allocation vs. target, and a sortable
holdings table. Light and dark mode included.

## Run it

No build step. Either open `index.html` directly in a browser, or serve the folder:

```bash
python3 -m http.server 5173
```

Then visit http://localhost:5173.

## Use your own data

Edit [`data.js`](data.js): account info, contribution limit/YTD, target allocation,
and holdings (shares, price, cost basis). Everything on the page is derived from it.

The value-over-time chart is currently **simulated** from the sample data and ends at
today's real total; swap in real monthly balances later if you have them.

## Files

- `index.html` – page layout
- `styles.css` – styling and light/dark theme tokens
- `app.js` – calculations, SVG charts, table sorting, tooltips
- `data.js` – your portfolio data
