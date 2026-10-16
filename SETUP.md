# Music Schedule: Setup

Volunteers open a web page on their phones, type their name, and see the dates they're serving. They can also browse every upcoming service, with the songs, accompanists, Congregational Singers, and media team.

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

- **My Dates** lists every upcoming service where the volunteer's name appears, with their roles ("Synth", "Congregational Singers Alto", "Slides"). Tapping a date opens the full service. A date where they're on the schedule but not in the Rotation tab for that week (a swap or a sub) gets a yellow "Not your usual week" tag. If only some of that day's roles changed, the tag names them ("Leading Singing: not your usual week"). Offering, Special, and one-time services aren't in the rotation, so they never get the tag.
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

## Song list

The **Songs** tab lists every congregational song, and the **Song Log** tab behind it records each time one was sung. They replace the dates on the old Grace Song Schedule sheet, which is still there, unchanged.

### Turning it on (one time)

1. Paste the new `Code.gs` into Apps Script and save.
2. In the function dropdown, pick **setupSongList** and click **Run**. Google asks for permission again, this time to run on a schedule. Allow it. This updates the song list now and every night around 2 AM.

You don't need a new deployment for this; the volunteer page doesn't use these tabs.

### The Songs tab

- **#** and **Song**, then **Last Sung**: the song's most recent date in the log, including dates already on the schedule. It uses the old sheet's colors: dark navy for over a year ago, blue for 200 days, green for 90, yellow for 45, light red for the last 45 days, and white for today or later (already scheduled).
- **12 mo**: how many times it was sung in the last 12 months. The more often, the darker green.
- **Category**, **Notes** (including when a song was introduced), and **Removed**.
- **Other names**: other ways a title gets typed on the schedule, separated by semicolons ("Amazing Grace (Chains Are Gone)"). Only needed when a song doesn't match on its own.
- The songs are in four sections: **Hymns** by number, **Modern Songs** A–Z, **Christmas**, and **Removed**. Checking **Removed**, or changing a song's **Category** to or from Christmas, moves it to the right section right away. Put the reason in Notes.
- To add a song, type it in the rows under **Add new songs below this line** (the number if it has one, the title, and a category). It moves into place the next time the list updates.
- Don't type in Last Sung or 12 mo; they're formulas.

### How songs get logged

Every night, and whenever you click **Music Schedule → Update song list**, the script reads the Songs rows (Song 1–5 and Closing) from every month tab and rewrites the Song Log's schedule rows. Changing a song in the schedule fixes the log the next time it runs. Cancelled services are skipped. Deleting an old month tab doesn't erase its songs from the log.

It matches by hymn number, but a hymn whose title matches wins, so "475 I'd Rather Have Jesus" still finds 474. Songs without a number are matched by title, modern songs first. Anything it can't match is highlighted yellow on the Song Log: either add the way it was typed to the song's **Other names**, or add the song if it's new. Entries that aren't songs, like "Congregational Favorites", just stay highlighted.

The history from the old sheet is on the Song Log with the source "Imported". You can add a missed date by hand: type the date in A and the song as you'd write it in **As written** (F), and the next update matches it.

## Weekly song email

A helper script in your personal Google account (dmluttrull@gmail.com) makes the weekly team email for you as two Gmail drafts, one for each half of the team, the same as the two emails you've been sending. It never sends anything: you add your personal touch and send both.

When you click **Make email drafts** in the builder, it makes the drafts for that Sunday. Each draft has:

- "Good afternoon," and your personal note from the builder (or "Hope you've had a great week!").
- **Notes**: no-service and Lord's Supper notes from Service Notes, anything unusual in Sunday's saved order (the choir led by Kevin Plew, a missionary presentation, Communion, a baptism), any song marked *New*, and your extra notes from the builder. If there's nothing, it says "This coming Sunday is a normal order of service."
- **Next Sunday**: the instrumentalists, offering, and special. **Two** and **Three Sundays Out**: offering and special, with that Sunday's Service Notes next to the date, or "TBA".
- Your Gmail signature.
- Attached: this Sunday's `YYYY-MM-DD_Order of Service.pdf` and `YYYY-MM-DD_AM.pdf`, and next Sunday's `YYYY-MM-DD_AM.pdf`, from the Orders of Service folder. Anything that isn't there yet is listed in the "drafts are ready" email, so you can attach it by hand.

### Setting it up (one time)

1. Share the **Orders of Service** folder from your school Drive with dmluttrull@gmail.com as a Viewer. (Done.)
2. Signed in as **dmluttrull@gmail.com**, go to <https://script.google.com> and click **New project**. Name it **Song Email**.
3. Delete what's in `Code.gs` and paste in this folder's `EmailHelper.gs`.
4. Click **Project Settings** (the gear), check **Show "appsscript.json" manifest file in editor**, go back to the editor, open `appsscript.json`, and replace it with this folder's `EmailHelper.appsscript.json`. Save.
5. Pick **setupEmailHelper** in the function dropdown and click **Run**. Allow the permissions (Gmail, Drive, Sheets, and running on a schedule); click **Advanced → Go to Song Email (unsafe)** if Google warns you. It makes a **Song Email Lists** sheet in your personal Drive with the two lists from your last song email; the Execution log has its link. Open it and check the lists.
6. Click **Deploy → New deployment**, choose **Web app**, set **Execute as: Me** and **Who has access: Anyone**, and click **Deploy**.
7. Pick **builderLink** and click **Run**. Copy the **Builder link** from the Execution log.
8. In the builder, open a Sunday, click **Make email drafts** in the **Team email** box, and paste the link. That computer remembers it.

### Each week

1. Make the order of service in the builder. In the **Team email** box at the bottom, write your personal note and any extra notes (one per line), then **Save**.
2. Save the PDF (**Save PDF**) into that month's folder in Orders of Service, and make the song packet on the **Song packet** page (it saves `YYYY-MM-DD_AM.pdf` there for you).
3. On Tuesday, once the PDFs are in the folder, click **Make email drafts** in the builder. It saves first, then opens a page that says what was attached.
4. Open Gmail → Drafts, look both over, and send them.

**Make email drafts** replaces drafts already made for that Sunday, so use it before you edit the drafts, not after. To change who gets the email, edit the Song Email Lists sheet. To run it without the builder, run **makeDraftsNow** in the Song Email project.

To have the drafts made automatically every week instead, set `DRAFT_DAY` at the top of `EmailHelper.gs` to a day (`'TUESDAY'`) and run **setupEmailHelper** again. That weekly run leaves drafts alone if they were already made that week, and emails you when they're ready. Set it back to `''` and run **setupEmailHelper** to turn it off. Either way, your lists stay as they are.

## Order of service builder

The builder makes the printed order of service from the same Sheet. Open <https://gracetoanderson.com/musicorder> on your computer. It forwards to <https://davidluttrull.github.io/grace-music/builder.html>, and it's laid out for a computer screen, not a phone.

### Turning it on (one time)

1. Paste the new `Code.gs` into Apps Script and save.
2. In the function dropdown, pick **setupOrderCode** and click **Run**. Open **Execution log**: the last line reads **Order of service code: 123456** with your own number. Keep it; the builder asks for it the first time you save, and that computer remembers it. Running it again shows the same code.
3. Click **Deploy → Manage deployments**, the pencil icon, **New version**, then **Deploy**.

To change the code, edit **ORDER_CODE** under **Project Settings → Script Properties**.

### Each week

1. Pick the date at the top, and the sheet size next to it: **3 per page** (third sheet, 3⅔ × 8½ in, the default), **2 per page** (half sheet, 5½ × 8½ in), or **6 per page** (3⅔ × 4¼ in, three across and two down, the default for Wednesdays). Wednesdays and other sheets each remember their own size. A Sunday sheet has the morning and evening services; a Wednesday or a one-time service gets its own sheet. Cancelled services are left off.
2. Each service starts from its default order with that week's songs, prelude, offering, special, and team filled in from the Sheet. Those show in gray with "from Song 1" (or similar) beside them. Type over one to change it on this sheet only; clear it to go back to the Sheet's value. Changes in the Sheet show up in the builder until you type over them.
3. Add verse notes ("all 4", "1, 3-4") in each hymn's Verses box. Hymn numbers and a "*New*" at the start of a song title come from the Sheet automatically.
4. Drag ⠿ to reorder. **Add** puts in a hymn, special song, choir, missionary presentation, Scripture reading, Communion, and more, just above the closing song. ● leaves an item off the sheet without deleting it; ✕ removes it.
5. The music leader prints in bold under each service's name ("Music Leader: David Luttrull"). Services with no leader in the Sheet (Sunday evening) have a Music leader box for it. **Show team credits** turns the Accompanists, Singers, and Media list on or off.
6. The preview shows one copy exactly as it prints. If a week runs long, the text shrinks a little to fit; if it still doesn't fit, the preview says so.
7. **Save** stores the sheet on the **Orders** tab, so you can finish it later or on another computer. Until you save, changes are kept on the computer you're using.
8. **Print** prints two, three, or six copies on one landscape letter page; cut them apart. Use Chrome, leave Scale at 100%, and turn off Headers and footers. To keep a PDF for your Drive folder, choose **Save as PDF** as the printer.
9. **Save PDF** makes a PDF of one copy, on a page the size of that sheet, for emailing as an attachment. It opens Chrome's print dialog: set **Destination** to **Save as PDF** and click **Save**. The file is named like "2026-11-01_Order of Service", the same as the files in your Orders of Service folder. Put it in that week's month folder (Orders of Service → 2026 → 11_November) so the weekly email can attach it. Chrome remembers the last destination, so switch it back to your printer the next time you use **Print**.

**Cancelling Sunday evening:** check **Cancelled** at the top of the Sunday Evening section and type a reason if you have one ("Thanksgiving Dinner"). The sheet prints "No Service – Thanksgiving Dinner" under Sunday Evening in place of the service. **Save** writes the same text to Sunday PM's Service Notes row in the Sheet, so the Sheet and the volunteer page show the service as cancelled too. It works the other way as well: a Sunday PM note you type in the Sheet that starts with "No Service" or "Cancelled" shows up checked in the builder, with the rest of the note as the reason. Uncheck Cancelled and Save to clear the note and bring the service back; its order is kept.

**Make this the default** saves a service's current order as the starting point for every new sheet of that kind (Sunday morning, Sunday evening, Wednesday, or one-time services). Verses and changed schedule values aren't carried into the default. **Start over** throws away this sheet's changes to that service and starts from the default again.

### Custom sheets

For a service that isn't in the Sheet, such as a date before November or a sheet you want to set up by hand, open the date list and pick **New custom Sunday…** or **New custom Wednesday…** at the bottom, under "Custom (not from the schedule)". A date box appears next to the list, set to the coming Sunday or Wednesday; change it to any date.

A custom Sunday has a morning and an evening service, the same as a regular Sunday sheet. Each service starts from its default order, but nothing comes from the schedule: type the songs and verses into the items, and fill in the **Team** box at the bottom (music leader, accompanists, singers, media, and an optional service note). Items that are left blank, like an unused hymn, don't print. Prelude and Announcements / Prayer fill in from the Prelude and Song Leader boxes. Wednesdays get the Wednesday look and 6 per page.

Save works the same way. Saved custom sheets, and ones you've started on this computer, are listed by date in the same section of the list. If you change a saved custom sheet's date, the copy under the old date is removed the next time you save.

Don't edit the Orders tab by hand; the builder reads and writes it.

## Song packet

The song packet page puts together the week's `YYYY-MM-DD_AM.pdf` for you. You pick which PDF to use for each song, and it combines them into one file in the right month folder. Open it from the **Song packet** button in the builder, or go to <https://davidluttrull.github.io/grace-music/packet.html>. It uses the same code as the builder.

### Turning it on (one time)

1. Paste the new `Code.gs` into the Sheet's Apps Script and save.
2. In the left sidebar, click **+** next to **Services**, pick **Drive API** (leave the version on v3), and click **Add**.
3. In the function dropdown, pick **setupSongPackets** and click **Run**. Google asks to let the script see and add files in your Drive. Allow it. The Execution log then says how many PDFs it found in Song PDFs.
4. Click **Deploy → Manage deployments**, the pencil icon, **New version**, then **Deploy**.

### Each week

1. Pick the service at the top. It starts on the coming Sunday morning. For a Sunday that isn't in the Sheet or the builder yet, pick **Another date…** at the bottom of the list.
2. Each song in that Sunday's order of service gets a row of choices: every PDF in Song PDFs (all its folders) whose name matches the song's title. If there's no order of service yet, the songs come from the Sheet. Each choice shows its first page, its folder, and how many pages it has.
3. Click a first page to see the whole PDF up close. **‹** and **›** (or the arrow keys) step through that song's choices, and **Use this one** picks it. You can also click the round check on a choice. The page remembers your pick for each song, so the next time that song comes up, the same PDF is already checked. A song with only one PDF is checked for you.
4. If a PDF has the song in more than one key or arrangement, use only the pages you want. In the close-up view, click a page to leave it out (click it again to put it back), or Shift-click to do a run of pages. You can also type the pages to keep in the **Pages** box at the top, like `4-6` or `1, 3`. **All pages** puts them all back. The choice and its page count show "pages 4–6 of 9," and the page remembers the pages along with the PDF for that song.
5. If the PDF you want isn't shown, type in **Find another PDF in Song PDFs** to search every file name, or click **Upload a PDF…** to use one from your computer. Uploaded PDFs are kept in Song PDFs → **Added from the packet page**, so they turn up next time. Move them into the right folder whenever you like.
6. **+ Add a song or reading** at the bottom adds something that isn't in the order of service, like a Scripture reading. Type its name to find matching PDFs, or search or upload as above. ↑ and ↓ move any item, and **Leave out** skips a song.
7. **Save to Drive** combines everything, in the order shown, into `YYYY-MM-DD_AM.pdf` in Orders of Service → 2026 → that month's folder, which is where the weekly email looks for it. If that file is already there, the old copy goes to the Drive trash. **Download** saves the same PDF to your computer.

Reopening the same Sunday later shows what you saved: your picks, added items, and songs left out. If you add PDFs to Song PDFs while the page is open, click **Re-read Drive**. Otherwise the page checks Drive for new files every six hours.

A few publishers lock their PDFs against changes. The page can't copy those pages directly, so it puts them in as high-quality pictures instead. They print the same, but you can't select their text.
