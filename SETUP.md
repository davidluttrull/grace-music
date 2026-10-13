# Music Schedule: Setup

Volunteers open a web page on their phones, type their name, and see the dates they're serving. They can also browse every upcoming service, with the songs, music team, Congregational Singers, and media team.

It has two parts:

- **The script** (`Code.gs`). It lives inside the **Music Schedule 2026** Google Sheet and hands the page the upcoming services. It reads only the month tabs. The Rotation and Away tabs are never sent, so nobody sees who's out of town. It also takes the page's "I'll be out" reports, adds them to the Away tab, and emails you.
- **The page** (`index.html`, plus the logo, icons, and `manifest.webmanifest`). It's hosted on GitHub Pages at <https://davidluttrull.github.io/grace-music/>, the same way as the attendance page. The church site forwards <https://gracetoanderson.com/musicschedule> there, and that's the address volunteers use.

Volunteers don't need a Google account. Anyone with the link can see the schedule, which is the same as sharing the Google Doc by link today.

## 1. Add the script to the Sheet

1. Open **Music Schedule 2026**, then **Extensions → Apps Script**.
2. Click "Untitled project" at the top and rename it **Music Schedule**.
3. Delete the few lines in `Code.gs` and paste in the entire contents of this folder's `Code.gs`.
4. Click the save icon.

## 2. Deploy it

1. Click **Deploy → New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Fill in:
   - **Description:** `v1`
   - **Execute as:** **Me**
   - **Who has access:** **Anyone**
4. Click **Deploy**. Google asks for permission the first time: click **Review permissions**, pick your account, then **Advanced → Go to Music Schedule (unsafe) → Allow**. The warning appears because you wrote the script yourself. It asks for access to your spreadsheets, which the Music Schedule menu uses to fill in names.
5. Copy the **Web app URL**. It ends in `/exec`.

To check it, open that URL on your phone. You should see text that starts with `{"services":`. (Your Mac's browser has refused to open these script links before, so use the phone.)

**If "Anyone" isn't in the list**, the school's Google account doesn't allow public web apps. In that case, make a copy of the Sheet under the church account (**File → Make a copy**) and do steps 1 and 2 in the copy. After that, the copy is the one to edit.

## 3. Connect the page

Near the bottom of `index.html`, find the line that starts with `const API_URL =` and put the `/exec` URL between the quotes. Then publish the page to GitHub Pages (Claude can do this part).

You only do this once. Deploying a new version of the script later keeps the same URL.

## 4. Share it with volunteers

Send the page's address, <https://gracetoanderson.com/musicschedule>. Each volunteer types their name once, and the phone remembers it. Saving the page to the home screen adds a **Music** icon:

- **iPhone:** open the link in Safari, tap Share, then **Add to Home Screen**.
- **Android:** open the link in Chrome, tap **⋮**, then **Add to Home screen**.

## How it works

- **My dates** lists every upcoming service where the volunteer's name appears, with their roles ("Synth", "Congregational Singers Alto", "Slides"). Tapping a date opens the full service.
- **Add to Calendar** (under each date) opens Google Calendar with the event filled in; the volunteer taps Save. **Add all my dates to my calendar** (at the top) downloads a calendar file with every date they're serving, which an iPhone opens in its Calendar app. Events start at 10:30 AM (Sunday AM, 90 minutes), 6:00 PM (Sunday PM, 75 minutes), and 7:00 PM (Wednesday, 60 minutes). The times are in `SERVICE_TIME` in `index.html`.
- **I'll be out** (under each date) asks the volunteer to confirm, then adds a row to the Away tab for that one service. Their name turns red on the schedule and you get an email. The date shows **Out**, with an **Undo** button that removes the row and emails you again.
- **All services** shows every upcoming service as a card, with buttons to show only Sunday AM, Sunday PM, or Wednesday. The volunteer's own name is highlighted.
- Services stay on the page through the day after they happen, so Sunday night still shows Sunday.
- The page loads fresh data every time it opens, so edits to the Sheet show up right away. If a phone has no signal, it shows the last copy it loaded and says so.

## Editing the Sheet

Gray names come from the Rotation tab. To change one week, type a name over it. The cell turns bold on yellow so you can see what you changed. Typing over a gray name only affects that one cell; the rest of the month still follows the rotation.

The **Music Schedule** menu (it appears a few seconds after the Sheet opens) has two items:

- **Reset selected cells to rotation:** select one or more cells you changed and click this to bring back the rotation names. You can select a whole block, or the whole tab; song, offering, special, and notes cells are left alone.
- **Add next month:** makes the next month's tab (for example **Jan 2027**) right after the latest one. Its dates fill in, every name comes from the rotation, and songs and notes start blank. The page finds the new tab on its own; you don't need to redeploy.

The first time you use the menu, Google asks for permission the same way it did in step 2.

- **Names:** type full names ("Eloise Foote") when you can. The page also recognizes the short forms you've used before, such as "E Foote" or "Eliana W". Several people in one cell can be separated by &, a comma, or /.
- **Offering and Special** can hold any text, such as "Men's Quartet (David Luttrull Lead)". Anyone named in it gets that date in My dates.
- **Away tab:** each row is a name, a From date, an optional To date, an optional Service, and a note. Leave To blank for one day. Put Sunday AM, Sunday PM, or Wednesday in Service to mark just that service, or leave it blank for every service. Rows the page adds have a note starting with "Volunteer page". To clear one, delete the row.
- Don't rename the service labels (Sunday AM, Sunday PM, Wednesday) or the "Week" rows. The script uses them to find each block.

## Updating the script

When `Code.gs` changes, paste the new version into Apps Script and save, then reload the Sheet. That's all the menu needs. If the change touches what the page shows (the `doGet` part), also click **Deploy → Manage deployments**, click the pencil icon, choose **New version** under Version, and click **Deploy**. Don't use **New deployment**, because that creates a new URL and the page would stop reaching the script.

## Turning on "I'll be out" (one time)

1. Paste the new `Code.gs` into Apps Script and save.
2. In the function dropdown next to **Debug**, pick **sendTestEmail** and click **Run**. Google asks for permission again, this time to send email as you. Allow it, and check that the test email arrives.
3. Click **Deploy → Manage deployments**, click the pencil icon, choose **New version**, and click **Deploy**.

Emails go to the account that owns the script. To send them somewhere else, open **Project Settings** (the gear icon), and under **Script Properties** add `NOTIFY_EMAIL` with the address.

Anyone with the page's link can press "I'll be out", but only for names that are on that service, and every report emails you. If someone misuses it, delete their rows on the Away tab.
