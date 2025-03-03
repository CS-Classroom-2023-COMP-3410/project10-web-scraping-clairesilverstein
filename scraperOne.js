const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

const BASE_URL = "https://bulletin.du.edu";
const CS_COURSES_URL = `${BASE_URL}/undergraduate/majorsminorscoursedescriptions/traditionalbachelorsprogrammajorandminors/computerscience/`;
const OUTPUT_DIR = "results";
const OUTPUT_FILE = path.join(OUTPUT_DIR, "bulletin.json");

async function fetchPage(url) {
    try {
        const response = await axios.get(url, {
            headers: { "User-Agent": "Mozilla/5.0" }
        });
        return response.data;
    } catch (error) {
        console.error(`Failed to fetch ${url}:`, error.message);
        return null;
    }
}

function parseCourses(html) {
    const $ = cheerio.load(html);
    let courses = [];

    $(".courseblock").each((_, block) => {
        const titleElement = $(block).find(".courseblocktitle");
        const descElement = $(block).find(".courseblockdesc");

        if (!titleElement.length || !descElement.length) return;

        const titleText = titleElement.text().replace(/\s+/g, " ").trim();
        const descText = descElement.text().replace(/\s+/g, " ").trim().toLowerCase(); // Normalize to lowercase for filtering

        // Extract course code and title
        const match = titleText.match(/(COMP)\s?(\d{4})[:\s](.+?)\s+\(\d+(-\d+)?\sCredit[s]?\)/);
        if (!match) return;

        const courseCode = `${match[1]}-${match[2]}`; // Format as COMP-XXXX
        const courseTitle = match[3];

        // Ensure it's an upper-division course (3000-level or higher)
        const courseNumber = parseInt(match[2], 10);
        if (courseNumber < 3000) return;

        // Check for any form of the word "prerequisite" (plural or singular)
        if (!descText.includes("prerequisite")) {
            courses.push({ course: courseCode, title: courseTitle });
        }
    });

    return courses;
}

function saveToJson(data) {
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify({ courses: data }, null, 4));
    console.log(`Saved ${data.length} courses to ${OUTPUT_FILE}`);
}

async function main() {
    const html = await fetchPage(CS_COURSES_URL);
    if (!html) {
        console.error("No HTML content retrieved. Exiting.");
        return;
    }

    const courses = parseCourses(html);
    if (courses.length === 0) {
        console.warn("No matching courses found. Check your filters or if the page loads dynamically.");
    } else {
        saveToJson(courses);
    }
}

main();
