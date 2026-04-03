// functions/api/explore.ts
// Proxy for IndianCoffeeBeans.com API — avoids CORS issues

const ICB_API = 'https://www.indiancoffeebeans.com/api/search-index';
const ICB_KEY = 'icb_live_d917c802bf100e9fd068024c30d4e97e5f1b5816d56c7d0e93c2fed2eab330b2';

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function onRequestGet() {
  try {
    const resp = await fetch(ICB_API, {
      headers: { 'Authorization': `Bearer ${ICB_KEY}` }
    });

    if (!resp.ok) {
      // Try without auth header in case the API doesn't need it
      const resp2 = await fetch(ICB_API);
      if (!resp2.ok) {
        return Response.json({ error: 'ICB API returned ' + resp2.status }, { status: 502, headers: CORS });
      }
      const data = await resp2.json();
      return Response.json(data, { headers: CORS });
    }

    const data = await resp.json();
    return Response.json(data, { headers: CORS });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500, headers: CORS });
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}
