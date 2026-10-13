# Music Schedule: Setup

Volunteers open a web page on their phones, type their name, and see the dates they're serving. They can also browse every upcoming service, with the songs, music team, Congregational Singers, and media team.

It has two parts:

- **The script** (`Code.gs`). It lives inside the **Music Schedule 2026** Google Sheet and hands the page the upcoming services. It reads only the month tabs. The Rotation and Away tabs are never sent, so nobody sees who's out of town.
- **The page** (`index.html`, plus the logo, icons, and `manifest.webmanifest`). It's hosted on GitHub Pages at <https://davidluttrull.github.io/grace-music/>, the same way as the attendance page.

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
4. Click **Deploy**. Google asks for permission the first time: click **Review permissions**, pick your account, then **Advanced → Go to Music Schedule (unsafe) → Allow**. The warning appears because you wrote the script yourself. It only asks to read your spreadsheets.
5. Copy the **Web app URL**. It ends in `/exec`.

To check it, open that URL on your phone. You should see text that starts with `{"services":`. (Your Mac's browser has refused to open these script links before, so use the phone.)

**If "Anyone" isn't in the list**, the school's Google account doesn't allow public web apps. In that case, make a copy of the Sheet under the church account (**File → Make a copy**) and do steps 1 and 2 in the copy. After that, the copy is the one to edit.

## 3. Connect the page

Near the bottom of `index.html`, find the line that starts with `const API_URL =` and put the `/exec` URL between the quotes. Then publish the page to GitHub Pages (Claude can do this part).

You only do this once. Deploying a new version of the script later keeps the same URL.

## 4. Share it with volunteers

Send the page's address, <https://davidluttrull.github.io/grace-music/>. Each volunteer types their name once, and the phone remembers it. Saving the page to the home screen adds a **Music** icon:

- **iPhone:** open the link in Safari, tap Share, then **Add to Home Screen**.
- **Android:** open the link in Chrome, tap **⋮**, then **Add to Home screen**.

## How it works

- **My dates** lists every upcoming service where the volunteer's name appears, with their roles ("Synth", "Congregational Singers Alto", "Slides"). Tapping a date opens the full service.
- **All services** shows every upcoming service as a card, with buttons to show only Sunday AM, Sunday PM, or Wednesday. The volunteer's own name is highlighted.
- Services stay on the page through the day after they happen, so Sunday night still shows Sunday.
- The page loads fresh data every time it opens, so edits to the Sheet show up right away. If a phone has no signal, it shows the last copy it loaded and says so.

## Editing the Sheet

- **New month:** duplicate a month tab and change the date in B1, the same as before. The page finds it on its own. You don't need to redeploy. The script treats any tab with "Month" in A1 as a month tab.
- **Names:** type full names ("Eloise Foote") when you can. The page also recognizes the short forms you've used before, such as "E Foote" or "Eliana W". Several people in one cell can be separated by &, a comma, or /.
- **Offering and Special** can hold any text, such as "Men's Quartet (David Luttrull Lead)". Anyone named in it gets that date in My dates.
- Don't rename the service labels (Sunday AM, Sunday PM, Wednesday) or the "Week" rows. The script uses them to find each block.

## Updating the script

When `Code.gs` changes, paste the new version into Apps Script and save. Then click **Deploy → Manage deployments**, click the pencil icon, choose **New version** under Version, and click **Deploy**. Don't use **New deployment**, because that creates a new URL and the page would stop reaching the script.
