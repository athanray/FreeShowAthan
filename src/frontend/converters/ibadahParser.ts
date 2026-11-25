// Parses a church service order ("Tata Ibadah", e.g. HKBP) from a PDF into service items.
// This file has no dependencies on the app, so it can be tested on its own.

export interface IbadahTextItem {
    str: string
    x: number
    y: number
    width: number
}

export interface IbadahLine {
    text: string
    x: number // where the text starts (after any bullet)
    bullet: boolean // verses start with a bullet in the PDF
}

export interface IbadahSong {
    book: string // KJ, NKB, BN, PKJ, BE ...
    number: string
    verses: string // "1:1-3" => "1-3"
    title: string
    lines: IbadahLine[]
}

export interface IbadahItem {
    number: number
    label: string // "VOTUM – INTROITUS – DOA"
    reference: string // "AXV.A.20 - D.XIII.54"
    song?: IbadahSong
}

export interface IbadahService {
    header: string // all text above the first item (used to tell languages apart)
    title: string
    church: string
    dateText: string // "18 Oktober 2026"
    isoDate: string // "2026-10-18"
    time: string // "07.30"
    theme: string
    items: IbadahItem[]
}

// settings (can be edited in the app)
export interface IbadahRule {
    match: string // words in the label of the item in the PDF (all must be in it, e.g. "votum tangiang")
    show: string // words that must be in the name of the show in the database (e.g. "votum tangiang")
    header?: string // optional: only if the top of the PDF contains these words (e.g. "batak")
}

export interface IbadahSettings {
    songWords: string // words that start a song line, separated by commas
    rules: IbadahRule[]
}

// the first matching rule is used, so put the most specific ones first
export const DEFAULT_IBADAH_SETTINGS: IbadahSettings = {
    songWords: "BERNYANYI, MARENDE",
    rules: [
        // Batak
        { match: "votum tangiang", show: "votum tangiang" },
        { match: "patik debata", show: "patik" },
        { match: "manopoti dosa", show: "manopoti" },
        { match: "manghatindanghon", show: "manghatindanghon" },
        { match: "tingting", show: "tingting" },
        { match: "jamita", show: "jamita" },
        { match: "tangiang panutup", show: "tangiang panutup" },
        { match: "acara marulaon", show: "marulaon" },
        // Indonesian
        { match: "votum doa", show: "votum doa" },
        { match: "hukum tuhan", show: "hukum" },
        { match: "pengakuan dosa", show: "pengakuan dosa" },
        { match: "pengakuan iman", show: "pengakuan iman" },
        { match: "persembahan pujian", show: "persembahan pujian" },
        { match: "warta", show: "warta" },
        { match: "khotbah", show: "khotbah" },
        { match: "doa penutup", show: "doa penutup" },
        // both
        { match: "epistel", show: "epistel" },
        { match: "koor", show: "koor" }
    ]
}

// items on the right side of the page that are not part of the lyrics
const RIGHT_COLUMN = /^(Berdiri|Jongjong|BL\.?\s*\d+)$/i

// combine text items into lines (grouped by their vertical position)
export function groupTextItems(items: IbadahTextItem[]): IbadahLine[] {
    const clean = items.filter((a) => a.str.trim())
    clean.sort((a, b) => b.y - a.y || a.x - b.x)

    const rows: IbadahTextItem[][] = []
    clean.forEach((item) => {
        const row = rows.find((r) => Math.abs(r[0].y - item.y) <= 3)
        if (row) row.push(item)
        else rows.push([item])
    })

    const lines: IbadahLine[] = []
    rows.forEach((row) => {
        row.sort((a, b) => a.x - b.x)
        row = row.filter((a) => !(a.x > 330 && RIGHT_COLUMN.test(a.str.trim())))
        if (!row.length) return

        // a single symbol before the text marks the start of a verse
        let bullet = false
        if (row.length > 1 && row[0].str.trim().length === 1 && !/[\p{L}\p{N}]/u.test(row[0].str) && row[1].x - row[0].x > 8) {
            bullet = true
            row = row.slice(1)
        }

        let text = ""
        let previousEnd = -1
        row.forEach((item) => {
            const needsSpace = previousEnd >= 0 && item.x - previousEnd > 1 && !text.endsWith(" ") && !item.str.startsWith(" ")
            text += (needsSpace ? " " : "") + item.str
            previousEnd = item.x + item.width
        })

        text = text.replace(/\s+/g, " ").trim()
        if (text) lines.push({ text, x: row[0].x, bullet })
    })

    return lines
}

const MONTHS: { [key: string]: string } = { januari: "01", februari: "02", maret: "03", april: "04", mei: "05", juni: "06", juli: "07", agustus: "08", september: "09", oktober: "10", november: "11", desember: "12" }

function toTitleCase(text: string) {
    if (text !== text.toUpperCase()) return text
    return text.toLowerCase().replace(/(^|[\s(-])(['‘’"“]?)(\p{L})/gu, (_m, a, b, c) => a + b + c.toUpperCase())
}

function escapeRegex(text: string) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

// "BERNYANYI KJ 427:1,4 Title", "MARENDE BE. 674:1-2 “Title” BL.674"
function songHeaderRegex(songWords: string) {
    const words = songWords
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean)
        .map(escapeRegex)
    if (!words.length) words.push("BERNYANYI")
    return new RegExp(`^(?:${words.join("|")})\\s+([A-Za-z]+)\\.?\\s*(?:No\\.?\\s*)?(\\d+[A-Za-z]?)\\s*(?:[:：]\\s*([\\d,+\\-–—….]*))?\\s*(.*)$`, "i")
}

const TITLE_LINE = /^(TATA IBADAH|PARTORDING|ORDER OF SERVICE|LITURGI)/i

function stripQuotes(text: string) {
    return text.replace(/^[“”"‘’']+(?=\p{L})|(?<=[\p{L}.!?,])[“”"]+$/gu, "").trim()
}

export function parseIbadah(lines: IbadahLine[], songWords: string = DEFAULT_IBADAH_SETTINGS.songWords): IbadahService {
    const SONG_HEADER = songHeaderRegex(songWords)
    const service: IbadahService = { header: "", title: "", church: "", dateText: "", isoDate: "", time: "", theme: "", items: [] }

    // header (before the first numbered item)
    let start = lines.findIndex((a) => /^1\.\s/.test(a.text) || a.text === "1.")
    if (start < 0) start = lines.length
    const header = lines.slice(0, start).map((a) => a.text)
    service.header = header.join(" ")
    service.title = header.find((a) => TITLE_LINE.test(a)) || ""
    service.church = header.find((a) => /HKBP|GKI|GPIB|Ressort|Gereja/i.test(a) && a !== service.title) || ""
    service.theme = (header.find((a) => /^TEMA\s*:/i.test(a)) || "").replace(/^TEMA\s*:\s*/i, "").replace(/^[“"]|[”"]$/g, "").trim()

    const dateMatch = header.join(" ").match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/)
    if (dateMatch && MONTHS[dateMatch[2].toLowerCase()]) {
        service.dateText = `${dateMatch[1]} ${dateMatch[2]} ${dateMatch[3]}`
        service.isoDate = `${dateMatch[3]}-${MONTHS[dateMatch[2].toLowerCase()]}-${dateMatch[1].padStart(2, "0")}`
    }
    const timeMatch = header.join(" ").match(/(\d{1,2})[.:](\d{2})\s*WIB/i)
    if (timeMatch) service.time = `${timeMatch[1].padStart(2, "0")}.${timeMatch[2]}`

    // items are numbered in order (the PDF can contain the same page twice, so stop when the numbering restarts)
    let expected = 1
    let current: { number: number; head: string; lines: IbadahLine[] } | null = null
    const raw: { number: number; head: string; lines: IbadahLine[] }[] = []

    for (let i = start; i < lines.length; i++) {
        const line = lines[i]
        if (TITLE_LINE.test(line.text)) break

        const match = line.text.match(/^(\d{1,2})\.\s*(.*)$/)
        if (match && Number(match[1]) === expected) {
            current = { number: expected, head: match[2].trim(), lines: [] }
            raw.push(current)
            expected++
            continue
        }

        if (current) current.lines.push(line)
    }

    raw.forEach((entry) => {
        const songMatch = entry.head.match(SONG_HEADER)
        if (songMatch) {
            const title = toTitleCase(stripQuotes(songMatch[4].replace(/\s+BL\.?\s*\d+\s*$/i, "").trim())).replace(/\.$/, "")
            // leave out the notes about the offering (collection)
            const lyrics = entry.lines.filter((a) => !/Kantor\s+Pusat|Amplop\s+Khusus|^Pendukung\s+Program|^(Persembahan|Pelean)\s+(tu\s+)?Huria/i.test(a.text))
            service.items.push({
                number: entry.number,
                label: "BERNYANYI",
                reference: `${songMatch[1].toUpperCase()} ${songMatch[2]}${songMatch[3] ? ":" + songMatch[3] : ""}`,
                song: { book: songMatch[1].toUpperCase(), number: songMatch[2], verses: (songMatch[3] || "").replace(/\.+$/, ""), title, lines: lyrics }
            })
            return
        }

        // "LABEL : reference"
        const split = entry.head.match(/^(.*?)\s+:\s+(.+)$/) || entry.head.match(/^(.*?)\s*:\s+(.+)$/)
        service.items.push({ number: entry.number, label: (split ? split[1] : entry.head).trim(), reference: split ? split[2].trim() : "" })
    })

    return service
}

// lyrics to text that can be converted to a show
export function songToText(song: IbadahSong): string {
    type Part = { type: "verse" | "chorus"; lines: string[]; repeatChorus: boolean }
    const parts: Part[] = []
    let current: Part | null = null

    song.lines.forEach((line) => {
        let text = line.text.trim()
        if (!text) return

        if (/^Reff\s*[:.]/i.test(text)) {
            text = text.replace(/^Reff\s*[:.]\s*/i, "")
            current = { type: "chorus", lines: [], repeatChorus: false }
            parts.push(current)
        } else if (line.bullet || !current) {
            current = { type: "verse", lines: [], repeatChorus: false }
            parts.push(current)
        }

        // "…Reff" at the end of a verse means the chorus is repeated
        const repeat = text.match(/\s*(?:…|\.\.\.)\s*Reff\.?$/i)
        if (repeat) {
            text = text.slice(0, repeat.index).trim()
            current!.repeatChorus = true
        }

        if (text) current!.lines.push(text)
    })

    // "1,4" => [1, 4], "1-3" => [1, 2, 3], "1+5" => [1, 5]
    const verseNumbers = expandVerses(song.verses)
    const verseCount = parts.filter((a) => a.type === "verse").length
    const useNumbers = verseNumbers.length === verseCount

    let chorus: string[] | null = null
    let verseNumber = 0
    const sections: string[] = []
    parts.forEach((part) => {
        if (part.type === "chorus") {
            if (!chorus) chorus = part.lines
            sections.push(["[Chorus]", ...part.lines].join("\n"))
            return
        }

        verseNumber++
        const label = useNumbers ? verseNumbers[verseNumber - 1] : verseNumber
        sections.push([`[Verse ${label}]`, ...part.lines].join("\n"))
        if (part.repeatChorus && chorus) sections.push(["[Chorus]", ...(chorus as string[])].join("\n"))
    })

    return sections.join("\n\n")
}

export function expandVerses(spec: string): number[] {
    const numbers: number[] = []
    spec.split(/[,+]/).forEach((part) => {
        const range = part.match(/^(\d+)\s*[-–—]\s*(\d+)$/)
        if (range) {
            for (let n = Number(range[1]); n <= Number(range[2]) && n < 100; n++) numbers.push(n)
            return
        }
        const single = part.match(/^(\d+)/)
        if (single) numbers.push(Number(single[1]))
    })
    return numbers
}

export function songName(song: IbadahSong): string {
    return `${song.book} ${song.number} ${song.title}`.trim()
}

function hasWords(text: string, words: string) {
    const lower = text.toLowerCase()
    const list = words
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
    return list.length > 0 && list.every((word) => lower.includes(word))
}

// the rule for an ordinary part of the service (the first one that fits)
export function findRoutine(label: string, header: string = "", rules: IbadahRule[] = DEFAULT_IBADAH_SETTINGS.rules): IbadahRule | null {
    return rules.find((rule) => hasWords(label, rule.match) && (!rule.header?.trim() || hasWords(header, rule.header))) || null
}

// the words a show name must contain
export function showNameMatches(name: string, rule: IbadahRule) {
    return hasWords(name, rule.show)
}
