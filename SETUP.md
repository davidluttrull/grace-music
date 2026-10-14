# Music Schedule: Setup

Volunteers open a web page on their phones, type their name, and see the dates they're serving. They can also browse every upcoming service, with the songs, music team, Congregational Singers, and media team.

It has two parts:

- **The script** (`Code.gs`). It lives inside the **Music Schedule 2026** Google Sheet and hands the page the upcoming services. It reads the month tabs and the table on the Rotation tab (not the notes under it). The Away tab is never sent, so nobody sees who's out of town. It also takes the page's "I'll be out" reports, adds them to the Away tab, and emails you.
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

- **My Dates** lists every upcoming service where the volunteer's name appears, with their roles ("Synth", "Congregational Singers Alto", "Slides"). Tapping a date opens the full service.
- **Add to Calendar** (under each date) opens Google Calendar with the event filled in; the volunteer taps Save. **Add all my dates to my calendar** (at the top) downloads a calendar file with every date they're serving, which an iPhone opens in its Calendar app. Events start at 10:30 AM (Sunday AM, 90 minutes), 6:00 PM (Sunday PM, 75 minutes), and 7:00 PM (Wednesday, 60 minutes). The times are in `SERVICE_TIME` in `index.html`.
- **I'll be out** (under each date) asks the volunteer to confirm, then adds a row to the Away tab for that one service. Their name turns red on the schedule and you get an email. The date shows **Out**, with an **Undo** button that removes the row and emails you again.
- **All Services** shows every upcoming service as a card, with buttons to show only Sunday AM, Sunday PM, or Wednesday. The volunteer's own name is highlighted.
- **Rotation** shows the regular lineup for the 1st through 5th week of the month, opening on the coming Sunday's week. Volunteers who've typed their name under My Dates also see "Your regular spots", every week they're in the rotation. It comes straight from the Rotation tab, so editing that table updates the page. Only the table is shared; the College students and Backup singers notes under it stay in the Sheet, as long as there's a blank row between the table and the notes.
- **Service Notes** from the Sheet show in a blue band at the top of each service in All Services, and in blue under the date in My Dates. They're also added to the calendar event's title.
- Services stay on the page through the day after they happen, so Sunday night still shows Sunday.
- The page loads fresh data every time it opens, so edits to the Sheet show up right away. If a phone has no signal, it shows the last copy it loaded and says so.

## Editing the Sheet

Gray names come from the Rotation tab. To change one week, type a name over it. The cell turns bold on yellow so you can see what you changed. Typing over a gray name only affects that one cell; the rest of the month still follows the rotation.

The **Music Schedule** menu (it appears a few seconds after the Sheet opens) has two items:

- **Reset selected cells to rotation:** select one or more cells you changed and click this to bring back the rotation names. You can select a whole block, or the whole tab; song, offering, special, and notes cells are left alone.
- **Add next month:** makes the next month's tab (for example **Jan 2027**) right after the latest one. Its dates fill in, every name comes from the rotation, and songs and notes start blank. The page finds the new tab on its own; you don't need to redeploy.

The first time you use the menu, Google asks for permission the same way it did in step 2.

- **Names:** type full names ("Eloise Foote") when you can. The page also recognizes the short forms you've used before, such as "E Foote" or "Eliana W". Several people in one cell can be separated by &, a comma, or /.
- **Service Notes** is the blue row at the top of each service (Sunday AM, Sunday PM, and Wednesday). Use it for anything the team should know about that service, such as "Lord's Supper" or "Hispanic Ministry Highlight Service". Leave it blank for a normal service. **Add next month** clears it for the new month.
- **Cancelling a service:** type a Service Note that starts with "Cancelled" (for example "Cancelled – snow"), or one like "No Regular Evening Service – Harvest Family Night". In the Sheet, the note turns red and that service's column turns gray with the names crossed out. On the page, the service is marked the same way, the Add to Calendar and I'll be out buttons go away, and Add all my dates skips it. Clear the note to bring the service back.
- **One-time services** (such as Christmas Eve) go below the Wednesday block, after a blank row. The header row has the service's name in column A, column B empty, and the date in C. Under it come a **Time** row ("6:00 PM" or "6:00-7:15 PM"), Service Notes, and the same role rows as Sunday morning. Names are typed in; there's no rotation for these. The December tab has a Christmas Eve block set up this way. On the page it shows like any other service, with its time, and its Add to Calendar button appears once Time is filled in. **Add next month** leaves one-time services out of the new month. To add another one, ask Claude, or copy the Christmas Eve block. A copy made by hand works on the page, but its red away and cancelled colors won't follow it in the Sheet.
- **Offering and Special** can hold any text, such as "Men's Quartet (David Luttrull Lead)". Anyone named in it gets that date in My Dates.
- **Away tab:** each row is a name, a From date, an optional To date, an optional Service, and a note. Leave To blank for one day. Put Sunday AM, Sunday PM, or Wednesday in Service to mark just that service, or leave it blank for every service. Rows the page adds have a note starting with "Volunteer page". To clear one, delete the row.
- Don't rename the service labels (Sunday AM, Sunday PM, Wednesday) or the "Week" rows, and keep column B empty on each service's header row. The script uses them to find each block.

## Updating the script

When `Code.gs` changes, paste the new version into Apps Script and save, then reload the Sheet. That's all the menu needs. If the change touches what the page shows (the `doGet` part), also click **Deploy → Manage deployments**, click the pencil icon, choose **New version** under Version, and click **Deploy**. Don't use **New deployment**, because that creates a new URL and the page would stop reaching the script.

## Turning on "I'll be out" (one time)

1. Paste the new `Code.gs` into Apps Script and save.
2. In the function dropdown next to **Debug**, pick **sendTestEmail** and click **Run**. Google asks for permission again, this time to send email as you. Allow it, and check that the test email arrives.
3. Click **Deploy → Manage deployments**, click the pencil icon, choose **New version**, and click **Deploy**.

Emails go to the account that owns the script. To send them somewhere else, open **Project Settings** (the gear icon), and under **Script Properties** add `NOTIFY_EMAIL` with the address.

Anyone with the page's link can press "I'll be out", but only for names that are on that service, and every report emails you. If someone misuses it, delete their rows on the Away tab.

## Order of service builder

The builder makes the printed order of service from the same Sheet. Open <https://davidluttrull.github.io/grace-music/builder.html> on your computer (it's laid out for a computer screen, not a phone).

### Turning it on (one time)

1. Paste the new `Code.gs` into Apps Script and save.
2. In the function dropdown, pick **setupOrderCode** and click **Run**. Open **Execution log**: the last line reads **Order of service code: 123456** with your own number. Keep it; the builder asks for it the first time you save, and that computer remembers it. Running it again shows the same code.
3. Click **Deploy → Manage deployments**, the pencil icon, **New version**, then **Deploy**.

To change the code, edit **ORDER_CODE** under **Project Settings → Script Properties**.

### Each week

1. Pick the date at the top, and the sheet size next to it: **2 per page** (half sheet, 5½ × 8½ in) or **3 per page** (third sheet, 3⅔ × 8½ in). The builder remembers your size. A Sunday sheet has the morning and evening services; a Wednesday or a one-time service gets its own sheet. Cancelled services are left off.
2. Each service starts from its default order with that week's songs, prelude, offering, special, and team filled in from the Sheet. Those show in gray with "from Song 1" (or similar) beside them. Type over one to change it on this sheet only; clear it to go back to the Sheet's value. Changes in the Sheet show up in the builder until you type over them.
3. Add verse notes ("all 4", "1, 3-4") in each hymn's Verses box. Hymn numbers and a "*New*" at the start of a song title come from the Sheet automatically.
4. Drag ⠿ to reorder. **Add** puts in a hymn, special song, choir, missionary presentation, Scripture reading, Communion, and more, just above the closing song. ● leaves an item off the sheet without deleting it; ✕ removes it.
5. **Show team credits** turns the Music, Singers, and Media list on or off. Services with no song leader in the Sheet (Sunday evening) have a Song leader box.
6. The preview shows one copy exactly as it prints. If a week runs long, the text shrinks a little to fit; if it still doesn't fit, the preview says so.
7. **Save** stores the sheet on the **Orders** tab, so you can finish it later or on another computer. Until you save, changes are kept on the computer you're using.
8. **Print** prints two or three copies side by side on one landscape letter page; cut them apart. Use Chrome, leave Scale at 100%, and turn off Headers and footers. To keep a PDF for your Drive folder, choose **Save as PDF** as the printer.

**Make this the default** saves a service's current order as the starting point for every new sheet of that kind (Sunday morning, Sunday evening, Wednesday, or one-time services). Verses and changed schedule values aren't carried into the default. **Start over** throws away this sheet's changes to that service and starts from the default again.

Don't edit the Orders tab by hand; the builder reads and writes it.
