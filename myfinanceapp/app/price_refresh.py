"""
Keeps prices current without anyone clicking: once a day, in the background.

The app has no scheduler, so this is one thread checking every hour. Checking
rather than sleeping until a set time is what makes it catch up after a restart.
It sends the symbols of your holdings to Yahoo Finance; the setting turns it off.
"""
import logging
import time
from datetime import date
from typing import Callable, Optional

logger = logging.getLogger(__name__)

ENABLED_PREFERENCE = 'auto_refresh_prices'
LAST_RUN_PREFERENCE = 'last_price_refresh'
CHECK_EVERY_SECONDS = 3600
#: Lets the app finish starting before the first check.
FIRST_CHECK_AFTER_SECONDS = 60


def refresh_if_due(db, refresh: Callable[[], None], today: Optional[date] = None) -> bool:
    """Run `refresh` if it is on and has not succeeded today. True when it ran.

    A failure is not recorded as done, so the next check tries again.
    """
    if str(db.get_preference(ENABLED_PREFERENCE, 'true')).lower() == 'false':
        return False
    today_text = (today or date.today()).isoformat()
    if db.get_preference(LAST_RUN_PREFERENCE, '') == today_text:
        return False
    try:
        refresh()
    except Exception as e:
        logger.warning("Daily price refresh failed, trying again at the next check: %s", e)
        return False
    db.set_preference(LAST_RUN_PREFERENCE, today_text)
    logger.info("Daily price refresh done")
    return True


def run_forever(db, refresh: Callable[[], None]) -> None:
    """Thread body. Nothing here may stop the loop: a bad day just tries again."""
    time.sleep(FIRST_CHECK_AFTER_SECONDS)
    while True:
        try:
            refresh_if_due(db, refresh)
        except Exception as e:
            logger.warning("Price refresh check failed: %s", e)
        time.sleep(CHECK_EVERY_SECONDS)
