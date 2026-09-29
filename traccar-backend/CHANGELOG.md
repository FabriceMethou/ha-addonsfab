# Changelog

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
