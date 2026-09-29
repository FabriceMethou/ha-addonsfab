"""The add-on's page in Home Assistant's sidebar (findings S-04, I-06).

Lists the enrolled phones and lets the owner revoke a lost one. It answers
only requests coming through Home Assistant's own panel (ingress), which
reach the add-on from the Supervisor's fixed address; the same paths
reached from the internet do not exist.
"""
import html
import os

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from app import database as db
from app import forwarder
from app.authz import visible_ids_for_unique_id
from app.broadcast import bus

router = APIRouter(include_in_schema=False)

INGRESS_PEER = "172.30.32.2"


def require_ingress(request: Request) -> None:
    peer = request.client.host if request.client else ""
    if peer != INGRESS_PEER and os.environ.get("ADMIN_ALLOW_ANY") != "1":
        raise HTTPException(status_code=404, detail="Not Found")


def _e(value) -> str:
    return html.escape("" if value is None else str(value))


@router.get("/", response_class=HTMLResponse, dependencies=[Depends(require_ingress)])
async def admin_page() -> HTMLResponse:
    sessions = await db.list_sessions()
    states = await db.list_device_states()
    groups = {g["id"]: g for g in await db.list_groups()}
    memberships = await db.list_memberships()
    health = await forwarder.health()
    alerts = await db.recent_alerts(20)
    names = {s["traccar_device_id"]: s["display_name"] for s in sessions}

    circles_of: dict[str, list[str]] = {}
    members_of: dict[int, list[str]] = {}
    by_uid = {s["device_unique_id"]: s for s in sessions}
    for m in memberships:
        group = groups.get(m["group_id"])
        if group is None:
            continue
        circles_of.setdefault(m["device_unique_id"], []).append(group["name"])
        who = by_uid.get(m["device_unique_id"])
        members_of.setdefault(group["id"], []).append(who["display_name"] if who else "(removed phone)")

    phone_rows = []
    for s in sorted(sessions, key=lambda s: s["display_name"].lower()):
        st = states.get(s["traccar_device_id"], {})
        version = db.load_status(st.get("status_json")).get("app_version")
        phone_rows.append(f"""
          <tr>
            <td><strong>{_e(s["display_name"])}</strong><br><small>device {s["traccar_device_id"]}</small></td>
            <td>{_e(st.get("last_seen_at") or st.get("last_fix_time") or "never")}</td>
            <td>{_e(st.get("sharing", "active"))}</td>
            <td>{_e(version or "?")}</td>
            <td>{_e(", ".join(circles_of.get(s["device_unique_id"], [])) or "none")}</td>
            <td>
              <form method="post" action="admin/revoke/{s["traccar_device_id"]}" class="revoke"
                    data-name="{_e(s["display_name"])}">
                <button type="submit">Revoke</button>
              </form>
            </td>
          </tr>""")

    circle_rows = "".join(
        f"<li><strong>{_e(g['name'])}</strong>: {_e(', '.join(members_of.get(g['id'], [])) or 'empty')}</li>"
        for g in groups.values()
    )
    alert_rows = "".join(
        f"<li>{_e(a['created_at'][:16].replace('T', ' '))} — {_e(a['title'])}</li>" for a in alerts
    )
    traccar_line = (
        f"Traccar is taking positions. Last write {_e(health['last_forward'] or 'not yet')}."
        if health["traccar_reachable"]
        else f"<span class=bad>Traccar is not taking positions ({_e(health['traccar_error'])}).</span>"
    )
    page = f"""<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MyLife360</title>
<style>
 body{{font:15px/1.5 system-ui,sans-serif;margin:0;padding:16px 20px;color:#1c1b1f;background:#fafafa}}
 @media (prefers-color-scheme:dark){{body{{color:#e6e1e5;background:#1c1b1f}} th{{background:#2b2930}} td,th{{border-color:#49454f}}}}
 h1{{font-size:22px;margin:0 0 4px}} h2{{font-size:17px;margin:24px 0 8px}}
 table{{border-collapse:collapse;width:100%}} th,td{{text-align:left;padding:6px 8px;border-bottom:1px solid #ddd;vertical-align:top}}
 th{{background:#eee;font-weight:600;font-size:13px}} small{{opacity:.7}} .bad{{color:#b3261e;font-weight:600}}
 button{{padding:4px 10px;border-radius:6px;border:1px solid #b3261e;background:transparent;color:#b3261e;cursor:pointer}}
 .wrap{{overflow-x:auto}}
</style></head><body>
<h1>MyLife360</h1>
<p>{traccar_line} Positions waiting: {health['pending_positions']}.</p>
<h2>Phones</h2>
<div class="wrap"><table>
 <tr><th>Person</th><th>Last heard from</th><th>Sharing</th><th>App</th><th>Circles</th><th></th></tr>
 {''.join(phone_rows) or '<tr><td colspan=6>No phone has joined yet.</td></tr>'}
</table></div>
<p><small>Revoke a lost or stolen phone: it is signed out, removed from its circles, and cannot join again without the enrolment code. Change the code in the add-on configuration if it may have been seen.</small></p>
<h2>Circles</h2><ul>{circle_rows or '<li>No circles yet.</li>'}</ul>
<h2>Recent alerts</h2><ul>{alert_rows or '<li>None yet.</li>'}</ul>
<script>
  // Names come from the phones: read them as data, never build script from them.
  document.querySelectorAll("form.revoke").forEach(function (form) {{
    form.addEventListener("submit", function (event) {{
      var name = form.dataset.name;
      if (!confirm("Revoke " + name + "? The phone stops sharing and must join again.")) {{
        event.preventDefault();
      }}
    }});
  }});
</script>
</body></html>"""
    return HTMLResponse(page)


@router.post("/admin/revoke/{device_id}", dependencies=[Depends(require_ingress)])
async def revoke(device_id: int) -> RedirectResponse:
    await db.revoke_device(device_id)
    await bus.refresh_visibility(visible_ids_for_unique_id)
    # Relative, so it works under Home Assistant's ingress path.
    return RedirectResponse(url="../../", status_code=303)
