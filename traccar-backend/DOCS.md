# MyLife360 Backend

The server side of the MyLife360 family-location app. It enrols phones,
decides who may see whom (circles), receives every position, detects
arrivals, departures, SOS, crashes, low battery and flights, and delivers
alerts to phones over the app's own connection. Traccar stays the long-term
location history.

```
phone ──HTTPS, device token──▶ this add-on ──LAN──▶ Traccar (history)
  ▲                                │
  └──── live updates and alerts ◀──┘
```

## Configuration

| Option | What it is |
|---|---|
| `traccar_url` | Traccar's address **on your LAN**, e.g. `http://192.168.2.243:30206`. |
| `traccar_admin_token` | A Traccar API token (see *Traccar account* below). |
| `enrolment_code` | The code a new phone must type to join. **Required**: without it nobody can enrol. |
| `traccar_osmand_lan_url` | Optional. Where Traccar's OsmAnd listener is on the LAN. Defaults to the host of `traccar_url` on port 5055. |
| `speeding_limit_kmh` | Speed counted as speeding in driving reports. Default 130. |
| `low_battery_percent` | Battery level that raises a "battery is low" alert. Default 15. |

## Circles

Anyone can create a circle and becomes its owner. Others join with an
invitation code created from inside the circle (valid 48 hours). Members see
each other's position, history and alerts; nobody else does. Places belong to
a circle. Places created in Traccar's own interface belong to no circle and are
visible to everyone until a member assigns them to one.

## The MyLife360 panel

*MyLife360* in Home Assistant's sidebar lists every enrolled phone (name,
app version, last heard from, circles), the circles and their members, the
latest alerts and whether Traccar is taking positions.

**Lost or stolen phone:** press *Revoke* next to it. The phone is signed
out, removed from every circle and can no longer see anyone. Its history
stays in Traccar. To use MyLife360 again it has to enrol with the enrolment
code.

**New phone:** *Make a one-time code* gives a code that works once, for 7
days, in place of the enrolment code. Send it to the person joining; it is
shown only once. The family code in the configuration keeps working too.

**Crash checks:** what the phones' crash check felt while driving: hard knocks
that stayed below the thresholds, and each "Are you OK?" with its answer.

The panel is only reachable through Home Assistant; the same pages do not
exist on the add-on's public address.

## Monitoring

`GET /health` answers `"status": "ok"` while Traccar takes positions and
`"degraded"` while it does not. Positions are then kept and sent later
(`pending_positions`); arrivals, departures and other alerts keep working in
the meantime, only the history is late. A Home Assistant REST sensor or an
uptime checker on this address shows when Traccar needs attention.

## Moving to a new phone

On the old phone: *Settings → Move to a new phone* shows a code valid for 15
minutes. Type it on the new phone instead of the enrolment code. The new phone
takes over the same history and circles; the old phone is signed out.

## App updates

1. Build a release APK in Android Studio (the file name carries the version,
   e.g. `mylife360-1.2.0-3-prod-release.apk`).
2. Copy it into Home Assistant's `share` folder, under `mylife360/`
   (Samba or the File editor add-on).
3. Each phone shows *Update available* the next time the app opens.

Phones older than 1.2.0 that send their version are asked to update instead
of failing in ways nobody can explain.

## Traccar account

The token only needs to manage the family's devices and places. Create a
Traccar user with *Manager* rights (device and user limits set to what the
family needs), generate a token for it, and use that instead of the admin
token. A leaked manager token then exposes the family's devices, not the
whole Traccar server.

## Exposure

Only this add-on needs to be reachable from the internet, over HTTPS. Once all
phones run 1.2.0, remove any public address pointing at Traccar's web
interface (port 8082 or 30206) or its OsmAnd port (5055).
