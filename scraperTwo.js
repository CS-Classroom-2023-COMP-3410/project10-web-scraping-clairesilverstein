const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

(async () => {
  try {
    const url = 'https://denverpioneers.com/index.aspx';
    const { data: html } = await axios.get(url);
    const $ = cheerio.load(html);

    const scriptTag = $('script')
      .filter((i, el) => {
        const content = $(el).html();
        return content && content.includes('var obj = ') && content.includes('"type":"events"');
      })
      .first()
      .html();

    if (!scriptTag) {
      throw new Error('Could not find the events JSON in a script tag.');
    }

    const regex = /var obj = (\{.*\});/s;
    const match = regex.exec(scriptTag);
    if (!match) {
      throw new Error('Could not extract the JSON object.');
    }

    let obj;
    try {
      obj = JSON.parse(match[1]);
    } catch (parseError) {
      throw new Error('JSON parsing failed: ' + parseError.message);
    }

    const schoolName = obj.extra?.school_name || 'University of Denver';

    const events = Array.isArray(obj.data)
    ? obj.data.map(event => {
        const duTeam = (event.sport && event.sport.title)
          ? `${schoolName} ${event.sport.title}`
          : schoolName;
  
        // Check if the event is a team-based match
        const isTeamEvent = event.opponent && event.opponent.title && !event.opponent.title.match(/Round|Slalom|Classic|Tournament|Meet|Race|Final|Heat/i);
  
        let opponent = isTeamEvent ? event.opponent.title.replace(/^#\d+\s*/, '') : null;
  
        // Ensure eventType is not null
        let eventType = !isTeamEvent ? (event.title || event.sport.title || 'Unknown Event') : null;
  
        const date = event.date || 'Unknown';
  
        // Construct final event structure
        return isTeamEvent
          ? { duTeam, opponent, date }  // Team vs. Team event
          : { duTeam, eventType, date }; // Individual event
      })
    : [];
  

    const output = { events };

    if (!fs.existsSync('results')) {
      fs.mkdirSync('results');
    }
    fs.writeFileSync('results/athletic_events.json', JSON.stringify(output, null, 4));
    console.log('Data saved to results/athletic_events.json');
  } catch (error) {
    console.error('Error:', error.message);
  }
})();
