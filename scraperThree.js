const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');


function cleanDescription(encodedStr) {
  const decoded = cheerio.load('<div>' + encodedStr + '</div>')('div').text();
  return decoded.trim();
}


function normalizeTime(timeStr) {
  if (!timeStr) return "";
  timeStr = timeStr.trim();
  if (timeStr === "06:00" || timeStr === "07:00") return "";
  return timeStr;
}


async function scrapeEventDetails(detailUrl) {
  try {
    const { data } = await axios.get(detailUrl);
    const $ = cheerio.load(data);

    const rawDescription = $('div.description').html() || '';
    const cleanedDescription = rawDescription ? cleanDescription(rawDescription) : '';

    let detailDate = '';
    let detailTime = '';

    // Search through all JSON‑LD blocks for one with "@type": "Event"
    $('script[type="application/ld+json"]').each((i, el) => {
      try {
        const jsonData = JSON.parse($(el).html());
        let eventJson = null;
        if (Array.isArray(jsonData)) {
          jsonData.forEach(item => {
            if (item['@type'] && item['@type'].toLowerCase() === 'event') {
              eventJson = item;
            }
          });
        } else if (jsonData['@type'] && jsonData['@type'].toLowerCase() === 'event') {
          eventJson = jsonData;
        }
        if (eventJson && eventJson.startDate) {
          const parts = eventJson.startDate.split('T');
          detailDate = parts[0];
          if (parts[1]) {
            // Get the first 5 characters ("HH:MM")
            detailTime = parts[1].substring(0, 5);
            detailTime = normalizeTime(detailTime);
          }
        }
      } catch (e) {
        // Ignore JSON parse errors
      }
    });

    return { description: cleanedDescription, date: detailDate, time: detailTime };
  } catch (err) {
    console.error(`Error scraping details for event (${detailUrl}): ${err.message}`);
    return { description: '', date: '', time: '' };
  }
}

async function scrapeListingPage(listingUrl) {
  try {
    console.log(`Scraping listing URL: ${listingUrl}`);
    const { data } = await axios.get(listingUrl);
    const $ = cheerio.load(data);

    // Adjust the selector below to match your event card elements.
    const eventElements = $('.event-card');

    const eventPromises = eventElements.map(async (i, el) => {
      const title = $(el).find('h3').text().trim();
      const listingDate = $(el).find('.date').text().trim();

      // Extract time from the listing (if any) and normalize it.
      let listingTime = $(el).find('.time').text().trim();
      listingTime = normalizeTime(listingTime);

      // Build the full URL to the event detail page.
      let detailPath = $(el).attr('href') || '';
      const detailUrl = detailPath.startsWith('http')
        ? detailPath
        : `https://www.du.edu${detailPath}`;

      // Scrape details (description, date, time) from the event detail page.
      const details = await scrapeEventDetails(detailUrl);

      // Prefer the JSON‑LD time if available; otherwise, use the listing time.
      const finalTime = normalizeTime(details.time) || listingTime;
      // Use the JSON‑LD date if available; else fallback to listing date.
      const eventDate = details.date || listingDate;

      // Build the event object with keys in the order: title, date, time (if valid), description.
      let eventObj = { title, date: eventDate };
      if (finalTime) {
        eventObj.time = finalTime;
      }
      if (details.description) {
        eventObj.description = details.description;
      }
      return eventObj;
    }).get();

    const events = await Promise.all(eventPromises);
    return events;
  } catch (err) {
    console.error(`Error scraping listing page: ${err.message}`);
    return [];
  }
}

// Main IIFE to run the scraper.
(async function() {
  try {
    const listingUrls = [
      'https://www.du.edu/calendar?search=&start_date=2025-01-01&end_date=2025-02-01',
      'https://www.du.edu/calendar?search=&start_date=2025-02-01&end_date=2025-03-01',
      'https://www.du.edu/calendar?search=&start_date=2025-03-01&end_date=2025-04-01',
      'https://www.du.edu/calendar?search=&start_date=2025-04-01&end_date=2025-05-01',
      'https://www.du.edu/calendar?search=&start_date=2025-05-01&end_date=2025-06-01',
      'https://www.du.edu/calendar?search=&start_date=2025-06-01&end_date=2025-07-01',
      'https://www.du.edu/calendar?search=&start_date=2025-07-01&end_date=2025-08-01',
      'https://www.du.edu/calendar?search=&start_date=2025-08-01&end_date=2025-09-01',
      'https://www.du.edu/calendar?search=&start_date=2025-09-01&end_date=2025-10-01',
      'https://www.du.edu/calendar?search=&start_date=2025-11-01&end_date=2025-12-01',
      'https://www.du.edu/calendar?search=&start_date=2025-12-01&end_date=2026-01-01'
    ];

    let allEvents = [];
    for (const url of listingUrls) {
      const events = await scrapeListingPage(url);
      console.log(`Found ${events.length} events from ${url}`);
      allEvents = allEvents.concat(events);
    }

    const output = { events: allEvents };
    fs.writeFileSync('results/calendar_events.json', JSON.stringify(output, null, 2));
    console.log(`Saved ${allEvents.length} events to results/calendar_events.json`);
  } catch (err) {
    console.error(err);
  }
})();
