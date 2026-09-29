# Changelog

## 1.2.4

Best with MyLife360 app 1.2.1.

- **Traccar down no longer means no alerts.** Positions are processed as soon
  as they arrive and queued for Traccar's history, which catches up when
  Traccar is back. `/health` reports `degraded` and how many positions wait.
- **Revoke a lost phone** from the new *MyLife360* panel in Home Assistant's
  sidebar, which also lists phones, circles and recent alerts.
- **"Has not been heard from for an hour"**: a phone that is sharing but
  stops reporting (switched off, flat battery, no coverage) raises an alert,
  and "is back online" when it reports again.
- **"Landed"**: a flight found in positions sent after landing becomes one
  alert.
- A phone whose clock is days ahead no longer freezes on the map.
- Positions from simulated-location apps are flagged to the family.
- **One-time enrolment codes** from the panel: each works once, for 7 days,
  so the family code no longer has to travel through chats.
- The panel lists what the phones' crash check felt (near misses and checks
  started), to tune its thresholds.
- Optional phone number per member for a *Call* button.
- The driving report lists each speeding and hard-braking event.
- Device tokens are stored hashed; existing phones keep working.
- Limits on uploads, live connections and crash reports per phone.
- Devices that never enrolled in MyLife360 no longer raise alerts.
- Removed the unused `traccar_osmand_url` and `traccar_admin_user_id` options.
- The add-on image is pinned to Home Assistant's Alpine 3.24 base and
  installs its packages in a virtualenv: the unpinned `latest` base had moved
  to Alpine 3.24, where the old image would no longer build. Dependencies
  updated (FastAPI, Uvicorn, httpx, websockets, sse-starlette, aiosqlite).

## 1.2.3

Best with MyLife360 app 1.2.0 built on or after 29 September.

- A trip saved while the phone had no data (a flight, a tunnel, abroad) no
  longer replays on the map when the phone reconnects. Every position is
  still stored in the history, so the trip shows on the member's page, but
  only the newest moves the marker.
- Positions older than the last one were skipped entirely; they now go into
  the history too.

## 1.2.2

- No more "took off" alerts on the autobahn or on a TGV: a flight now needs
  350 km/h, above any car or high-speed train and below any cruising plane.

## 1.2.1

- The driving report no longer fails with a server error when Traccar is
  slow to compute trips: reports get 25 seconds instead of 10, and if
  Traccar still cannot answer, the week's speeding and braking counts are
  shown with a note instead of an error.

## 1.2.0

Requires MyLife360 app 1.2.0.

- The backend now decides: arrivals, departures, SOS, crash checks, low
  battery, flights, speeding and hard braking are detected on the server and
  delivered even when the app is closed.
- Phones post positions to the backend (`POST /positions`) with their token;
  the backend forwards them to Traccar on the LAN. The public OsmAnd port is
  no longer needed.
- Circles have an owner and are joined only with an invitation code. Any
  enrolled phone could previously add itself to any circle.
- Live updates reach only the phone's circles. The 1.1.0 filter did not
  recognise the stream's own messages and passed every position to every phone.
- Places can be created, edited and deleted from the app, and belong to a circle.
- Moving to a new phone uses a transfer code. Enrolling with an existing
  member's name no longer takes over their device.
- New: alerts history (`/alerts`), SOS and check-ins, sharing status,
  driving reports (`/driving`), app updates served from `/share/mylife360`.
- A global brake on wrong enrolment codes.
- Removed `/events` (replaced by `/alerts`).

## 1.1.0

- Enrolment requires `enrolment_code`.
- Reads are scoped to the caller's circles.
- Wi-Fi mappings are scoped to circles.
