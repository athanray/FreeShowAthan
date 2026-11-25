<script lang="ts">
    import { DEFAULT_IBADAH_SETTINGS, type IbadahRule, type IbadahSettings } from "../../../converters/ibadahParser"
    import { activePopup, popupData, special } from "../../../stores"
    import HRule from "../../input/HRule.svelte"
    import MaterialButton from "../../inputs/MaterialButton.svelte"
    import MaterialTextInput from "../../inputs/MaterialTextInput.svelte"

    $: settings = ($special.ibadah || DEFAULT_IBADAH_SETTINGS) as IbadahSettings
    $: rules = (settings.rules || []) as IbadahRule[]

    function save(newSettings: IbadahSettings) {
        special.update((a) => {
            a.ibadah = newSettings
            return a
        })
    }

    function updateRule(index: number, key: keyof IbadahRule, value: string) {
        const newRules = rules.map((rule) => ({ ...rule }))
        newRules[index][key] = value
        save({ ...settings, rules: newRules })
    }

    function addRule() {
        save({ ...settings, rules: [...rules, { match: "", show: "", header: "" }] })
    }

    function deleteRule(index: number) {
        save({ ...settings, rules: rules.filter((_, i) => i !== index) })
    }

    function moveRule(index: number, direction: -1 | 1) {
        const target = index + direction
        if (target < 0 || target >= rules.length) return
        const newRules = [...rules]
        ;[newRules[index], newRules[target]] = [newRules[target], newRules[index]]
        save({ ...settings, rules: newRules })
    }

    function reset() {
        special.update((a) => {
            delete a.ibadah
            return a
        })
    }

    function goBack() {
        const previousPopup = $popupData.previousPopup
        if ($popupData.previousData) popupData.set($popupData.previousData)
        if (previousPopup) activePopup.set(previousPopup)
        else activePopup.set(null)
    }
</script>

<MaterialButton class="popup-back" icon="back" iconSize={1.3} title="actions.back" on:click={goBack} />

<p class="info">
    Every item in the service order PDF is matched with the first rule that fits. The words in "PDF item contains" must all be in the item name in the PDF (not case sensitive), and the show with the shortest name containing all the words in "Show name contains" is used. Items without a rule, or without a matching show, get a simple new show.
</p>

<MaterialTextInput label="Song lines start with (separated by commas)" value={settings.songWords || ""} on:change={(e) => save({ ...settings, songWords: e.detail })} />

<HRule title="Ordinary parts of the service" />

{#each rules as rule, i}
    <div class="rule">
        <MaterialTextInput label="PDF item contains" value={rule.match} on:change={(e) => updateRule(i, "match", e.detail)} />
        <MaterialTextInput label="Show name contains" value={rule.show} on:change={(e) => updateRule(i, "show", e.detail)} />
        <MaterialTextInput label="Only if PDF title contains (optional)" value={rule.header || ""} on:change={(e) => updateRule(i, "header", e.detail)} />
        <div class="buttons">
            <MaterialButton icon="up" title="actions.move_up" on:click={() => moveRule(i, -1)} disabled={i === 0} />
            <MaterialButton icon="down" title="actions.move_down" on:click={() => moveRule(i, 1)} disabled={i === rules.length - 1} />
            <MaterialButton icon="delete" title="actions.delete" on:click={() => deleteRule(i)} white />
        </div>
    </div>
{/each}

<div class="actions">
    <MaterialButton variant="outlined" icon="add" style="flex: 1;" on:click={addRule}>Add rule</MaterialButton>
    <MaterialButton variant="outlined" icon="reset" style="flex: 1;" on:click={reset}>Reset to default</MaterialButton>
</div>

<style>
    .info {
        opacity: 0.7;
        font-size: 0.85em;
        margin-bottom: 10px;
        white-space: normal;
    }

    .rule {
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 4px 0;
        border-bottom: 1px solid var(--primary-lighter);
    }

    .rule :global(.textfield) {
        flex: 1;
        min-width: 0;
    }

    .buttons {
        display: flex;
    }

    .actions {
        display: flex;
        gap: 5px;
        margin-top: 15px;
    }
</style>
