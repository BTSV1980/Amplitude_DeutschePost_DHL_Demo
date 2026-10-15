# Post & Parcel – Amplitude vision demo for Deutsche Post DHL

A mobile-style web app modelled on the Post & DHL app, wired to Amplitude project **880241** (org AmpliDemo, 46900), plus 30 days of synthetic data, two backfilled experiments and synthetic voice-of-customer feedback.

| Folder | What it is |
|---|---|
| `site/` | The GitHub Pages site (publish this folder as the site root) |
| `tools/generate_dhl.py` | Event generator (20k users, 30 days, 3 journeys, 2 experiments) |
| `tools/generate_feedback.py` | Builds the AI Feedback CSV from the same simulated users |
| `data/ai_feedback_synthetic.csv` | 420 English feedback comments tied to real `user_id`s |

---

## 1. Deploy to GitHub Pages

Use a repository in the company GitHub organisation rather than a personal account.

1. Create a repo, e.g. `post-parcel-demo`, and copy the **contents** of `site/` into the repo root (including the hidden `.nojekyll`).
2. Settings → Pages → Source: *Deploy from a branch* → `main` / `(root)`.
3. Open `https://<org>.github.io/post-parcel-demo/`. First visit shows onboarding.

The site sets `noindex` and ships a `robots.txt` that disallows crawling. It shows a "not affiliated with Deutsche Post DHL" note and uses no DHL logo, and its login is a persona picker rather than a password form. Keep it that way: DHL is a heavily phished brand, and lookalike pages with tracking and payment forms get flagged quickly.

### URL switches (for bots and live demos)

| Parameter | Effect |
|---|---|
| `?exp_activation=treatment` | Packstation screen shows "Verify with your ID card" first, letter demoted to a link |
| `?exp_wallet=treatment` | Checkout shows Google Pay / Apple Pay first with an "Express" badge |
| `?paypal=fail` / `?paypal=ok` | Force the PayPal timeout or a success (default: 35 % failure) |
| `?scan=fail` / `?scan=ok` | Force the barcode scanner result (default: 25 % failure) |
| `?debug=1` | Logs every tracked event to the browser console |

"More → Reset demo" clears local state and calls `amplitude.reset()`, so the next run is a brand-new user. Use it between bot runs.

The URL switches only change the UI. The site does not run the Experiment SDK, so live visits do **not** send `$exposure` events. The experiment results come from the backfilled data.

---

## 2. Amplitude setup checklist

Already done in project 880241:

- 576,243 events / 20,000 users, 15 Sep – 15 Oct 2026
- Dashboard: <https://app.amplitude.com/analytics/amplidemo/dashboard/r5bykuko> (personal space, unpublished)
- Experiment `packstation-instant-activation`: <https://app.amplitude.com/experiment/amplidemo/880241/config/1535427>
- Experiment `express-checkout-wallet`: <https://app.amplitude.com/experiment/amplidemo/880241/config/1535428>
- Metrics: Packstation Activated (users), Shipping Label Purchased (users), Payment Failed (users)

Still to do by hand:

1. **Experiments** – for each: add a deployment, set rollout to 100 %, start it, then set the analysis start date back to **15 Sep 2026**. Until then the results tab is empty.
2. **Guides & Surveys** – suggested setup:
   - *Guide* "Activate Packstation in 30 seconds", page URL contains `#/packstation`, anchor `#ps-activate`.
   - *Exit survey* triggered by event `Activation Code Requested By Mail`: "What would have let you activate right now?" (ID card in app / customer card / other).
   - *CSAT* triggered by `Shipping Label Purchased`.
   - *NPS* triggered by `Feedback Opened` (More → Send feedback).
3. **Web Experiment** – visual editor on the site root. Good targets: `#track-hero-title` (headline copy) or `#ship-cta` (button prominence). It has no historical data; it is the live "edit the page" moment.
4. **AI Feedback** – connect the Google Play source for `de.dhl.paket` (real reviews, mostly German) and add `data/ai_feedback_synthetic.csv` if your account offers a file/CSV source. Check how German reviews are summarised in a test project before the demo.
5. **Session Replay** – run the bot against the live site. Replays will show Web platform; the synthetic history is iOS/Android.

---

## 3. Taxonomy (all English)

**Journey A – Packstation activation (main story)**
`App Opened` (`is_first_open`) → `Onboarding Completed` → `Packstation Activation Started` → `Activation Code Entered` → `Packstation Activated`
Supporting: `Onboarding Started`, `Notification Permission Responded`, `Account Login Completed`, `Packstation Tab Viewed`, `Activation Method Selected` (`activation_method`: `letter_code` / `customer_card_scan` / `instant_id_check`), **`Activation Code Requested By Mail`** (friction), `Customer Card Scan Failed`, `ID Check Abandoned`, `Activation Code Rejected`, `Activation Letter Not Received`, `Pickup Code Viewed`, `Parcel Picked Up`.

**Journey B – Shipping label (revenue)**
`Shipping Flow Started` → `Parcel Size Selected` → `Recipient Address Entered` → `Payment Method Selected` → `Shipping Label Purchased` (revenue fields `price`, `revenue`, `productId`)
Friction: **`Payment Failed`** (`payment_method`, `error_type: redirect_timeout`). Then `Mobile Label QR Viewed`.

**Journey C – Tracking habit (retention)**
`Shipment Tracked` (`tracking_method`: manual_entry / barcode_scan / push_notification / saved_list), `Shipment Details Viewed`, `Live Tracking Viewed`, `Delivery Options Viewed`, `Delivery Option Booked`, `Shipment Saved`, **`Barcode Scan Failed`** (spikes on Android from app version 9.5.0).

**Other:** `Location Search Performed`, `Location Details Viewed`, `Bonus Program Joined`, `Feedback Opened`, `Help Center Opened`, `Logged Out`, `Notification Settings Changed`.

**User properties:** `login_status`, `packstation_activated`, `has_customer_card`, `has_post_number`, `customer_segment` (online_shopper / private_sender / small_seller), `preferred_payment_method`, `bonus_program_member`, `push_enabled`, `utm_medium`, `device_type`, `city_region`.

---

## 4. Demo script (about 20 minutes)

1. **Analytics (4 min)** – Dashboard row 2: half the users who start Packstation activation never enter a code. Click step 4 → *Explore Conversion Drivers* → *Dropped Off*: `Activation Code Requested By Mail` is top. Retention row: activated users keep tracking parcels far more often, so this is a cost-to-serve story (fewer doorstep attempts), not a UX nit. Open a **User Journey** from `Packstation Activation Started` to show where droppers go.
2. **Global Chat (3 min)** – prompts that work with this data:
   - "Why are new users not activating Packstation?"
   - "Which payment method causes most failed label purchases, and how many purchases do we lose?"
   - "Did anything change in barcode scanning after the 9.5.0 release?"
   - "Compare 7-day retention for users who activated Packstation vs. those who didn't."
3. **Session Replay (3 min)** – filter replays on `Activation Code Requested By Mail` or `Payment Failed`; show the PayPal spinner and the "code is on its way" dead end.
4. **AI Feedback (3 min)** – top complaint themes match the funnel: activation letter, PayPal, Android scanner. Show that feedback authors are the same users who hit the friction (shared `user_id`).
5. **Experiment (4 min)** – `packstation-instant-activation`: treatment lifts activation strongly; `express-checkout-wallet`: smaller but significant lift with fewer payment failures. Then the Web Experiment in the visual editor.
6. **Guides & Surveys (3 min)** – trigger the exit survey live by choosing "Request activation code by letter" in the app, then show the Packstation guide.

---

## 5. Regenerating or topping up data

```bash
cd tools
# reproduce the exact uploaded dataset (no duplicates thanks to deterministic insert_ids)
python3 generate_dhl.py --users 20000 --days 30 --now 2026-10-15T08:34:34 --dry-run
# upload
python3 generate_dhl.py --users 20000 --days 30 --now 2026-10-15T08:34:34 --api-key <API_KEY>
# rebuild the feedback CSV
python3 generate_feedback.py
```

The generator has no top-up mode. A run with a later `--now` reshuffles users after the first divergence and would create a second, partly different population. For a fresh window before the demo, use a new `--seed` in a clean project rather than appending.
