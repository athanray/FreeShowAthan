import { getDocument, GlobalWorkerOptions } from "pdfjs-dist"
import { get } from "svelte/store"
import { uid } from "uid"
import type { ProjectShowRef } from "../../types/Projects"
import type { Show } from "../../types/Show"
import { history } from "../components/helpers/history"
import { encodeFilePath } from "../components/helpers/media"
import { activePopup, activeProject, activeShow, projects, projectView, shows, special } from "../stores"
import { newToast } from "../utils/common"
import { DEFAULT_IBADAH_SETTINGS, findRoutine, groupTextItems, parseIbadah, showNameMatches, songName, songToText, type IbadahItem, type IbadahLine, type IbadahRule, type IbadahSettings } from "./ibadahParser"
import { convertText } from "./txt"

// Creates a project from a church service order (Tata Ibadah) PDF:
// - ordinary parts (votum, hukum tuhan, ...) use the existing shows in the database
// - songs are created from the lyrics in the PDF as private shows (only in this project)
export async function importIbadah(paths: string[]) {
    const path = paths?.[0]
    if (!path) return

    let lines: IbadahLine[] = []
    try {
        GlobalWorkerOptions.workerSrc = "./assets/pdf.worker.min.mjs"
        const pdf = await getDocument({ url: encodeFilePath(path) }).promise
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
            const page = await pdf.getPage(pageNumber)
            const content = await page.getTextContent()
            const items = content.items.filter((a: any) => typeof a.str === "string").map((a: any) => ({ str: a.str, x: a.transform[4], y: a.transform[5], width: a.width }))
            lines.push(...groupTextItems(items))
        }
    } catch (err) {
        console.error("Could not read service order PDF:", err)
        newToast("Could not read the PDF")
        return
    }

    const settings: IbadahSettings = { ...DEFAULT_IBADAH_SETTINGS, ...(get(special).ibadah || {}) }
    const service = parseIbadah(lines, settings.songWords)
    if (!service.items.length) {
        newToast("No service items found in the PDF")
        return
    }

    const newShows: { id: string; show: Show }[] = []
    const projectItems: ProjectShowRef[] = []

    function createPrivateShow(name: string, text: string) {
        const created = convertText({ name, text, isPrivate: true, noFormatting: true, returnData: true })
        newShows.push(created)
        return created.id
    }

    function findExistingShow(rule: IbadahRule) {
        const matches = Object.entries(get(shows))
            .filter(([_id, show]) => !show.private && showNameMatches(show.name || "", rule))
            .sort((a, b) => (a[1].name || "").length - (b[1].name || "").length)
        return matches[0]?.[0] || ""
    }

    service.items.forEach((item: IbadahItem) => {
        if (item.song) {
            const text = songToText(item.song)
            const id = createPrivateShow(songName(item.song), text || item.song.title)
            projectItems.push({ id, type: "show" })
            return
        }

        // show the reference (bible verse, song numbers...) as a project section
        if (item.reference) projectItems.push({ id: uid(5), type: "section", name: `${item.label} : ${item.reference}`, notes: "" } as ProjectShowRef)

        const routine = findRoutine(item.label, service.header, settings.rules)
        const existing = routine ? findExistingShow(routine) : ""
        if (existing) {
            projectItems.push({ id: existing, type: "show" })
            return
        }

        // no show in the database for this part
        const id = createPrivateShow(item.label, [item.label, item.reference].filter(Boolean).join("\n"))
        projectItems.push({ id, type: "show" })
    })

    if (newShows.length) history({ id: "SHOWS", newData: { data: newShows, projectImport: true } })

    const hour = Number(service.time.split(".")[0])
    const period = isNaN(hour) ? "" : hour < 11 ? "Pagi" : hour < 17 ? "Siang" : "Malam"
    const name = [service.isoDate || "Tata Ibadah", period ? `(${period})` : ""].filter(Boolean).join(" ")

    const projectId = uid()
    const project = { name, created: Date.now(), used: Date.now(), parent: "/", shows: projectItems }
    history({ id: "UPDATE", newData: { data: project }, oldData: { id: projectId }, location: { page: "show", id: "project" } })

    activeProject.set(projectId)
    projectView.set(false)
    activeShow.set(null)
    activePopup.set(null)

    const found = projectItems.filter((a) => a.type === "show" && get(shows)[a.id] && !get(shows)[a.id].private).length
    newToast(`${name}: ${projectItems.filter((a) => a.type === "show").length} items (${found} from the database)`)
}
