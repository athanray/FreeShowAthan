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
    title: string
    church: string
    dateText: string // "18 Oktober 2026"
    isoDate: string // "2026-10-18"
    time: string // "07.30"
    theme: string
    items: IbadahItem[]
}

// items on the right side of the page that are not part of the lyrics
const RIGHT_COLUMN = /^(Berdiri|BL\s*\d+)$/i

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

const SONG_HEADER = /^BERNYANYI\s+([A-Za-z]+)\s*(\d+[A-Za-z]?)\s*(?:[:：]\s*([\d,+\-–—…]+))?\s*(.*)$/i

export function parseIbadah(lines: IbadahLine[]): IbadahService {
    const service: IbadahService = { title: "", church: "", dateText: "", isoDate: "", time: "", theme: "", items: [] }

    // header (before the first numbered item)
    let start = lines.findIndex((a) => /^1\.\s/.test(a.text) || a.text === "1.")
    if (start < 0) start = lines.length
    const header = lines.slice(0, start).map((a) => a.text)
    service.title = header.find((a) => /^TATA IBADAH/i.test(a)) || ""
    service.church = header.find((a) => /HKBP|GKI|GPIB|Ressort|Gereja/i.test(a) && a !== service.title) || ""
    service.theme = (header.find((a) => /^TEMA\s*:/i.test(a)) || "").replace(/^TEMA\s*:\s*/i, "").trim()

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
        if (/^TATA IBADAH/i.test(line.text)) break

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
            const title = toTitleCase(songMatch[4].replace(/\s+BL\s*\d+\s*$/i, "").trim())
            const lyrics = entry.lines.filter((a) => !/^Persembahan\s+Huria/i.test(a.text))
            service.items.push({
                number: entry.number,
                label: "BERNYANYI",
                reference: `${songMatch[1].toUpperCase()} ${songMatch[2]}${songMatch[3] ? ":" + songMatch[3] : ""}`,
                song: { book: songMatch[1].toUpperCase(), number: songMatch[2], verses: songMatch[3] || "", title, lines: lyrics }
            })
            return
        }

        // "LABEL : reference"
        const split = entry.head.match(/^(.*?)\s+:\s+(.+)$/) || entry.head.match(/^(.*?)\s*:\s+(.+)$/)
        service.items.push({ number: entry.number, label: (split ? split[1] : entry.head).trim(), reference: split ? split[2].trim() : "" })
    })

    return service
}

// The ordinary parts of the service (use the existing show in the database)
// keys: words that must all be in the show name (lowercase)
export const ROUTINE_SHOWS: { match: RegExp; keys: string[] }[] = [
    { match: /votum/i, keys: ["votum"] },
    { match: /hukum/i, keys: ["hukum"] },
    { match: /pengakuan\s+dosa/i, keys: ["pengakuan", "dosa"] },
    { match: /epistel/i, keys: ["epistel"] },
    { match: /pengakuan\s+iman/i, keys: ["pengakuan", "iman"] },
    { match: /koor/i, keys: ["koor"] },
    { match: /persembahan\s+pujian/i, keys: ["persembahan", "pujian"] },
    { match: /warta/i, keys: ["warta"] },
    { match: /khotbah/i, keys: ["khotbah"] },
    { match: /doa\s+penutup/i, keys: ["doa", "penutup"] }
]

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

export function findRoutine(label: string): { keys: string[] } | null {
    return ROUTINE_SHOWS.find((a) => a.match.test(label)) || null
}
