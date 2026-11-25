<script lang="ts">
    import Icon from "../../common/components/Icon.svelte"
    import { send } from "../util/socket"
    import { pptData } from "../util/stores"

    let collapsed = false

    function navigate(action: "previous_slide" | "next_slide") {
        send("API:" + action)
    }
</script>

{#if $pptData}
    <div class="ppt" class:collapsed>
        <div class="bar">
            <button class="icon" type="button" on:click={() => navigate("previous_slide")} aria-label="Previous">
                <Icon id="previous" size={1.5} />
            </button>
            <button class="title" type="button" on:click={() => (collapsed = !collapsed)}>
                <span class="name">PowerPoint</span>
                <span class="counter">{$pptData.position || 0}/{$pptData.slides || 0}</span>
            </button>
            <button class="icon" type="button" on:click={() => navigate("next_slide")} aria-label="Next">
                <Icon id="next" size={1.5} />
            </button>
        </div>

        {#if !collapsed}
            <div class="content">
                {#if $pptData.image}
                    <img src={$pptData.image} alt="" />
                {:else}
                    <div class="empty">…</div>
                {/if}

                {#if $pptData.title}<p class="slide-title">{$pptData.title}</p>{/if}
                {#if $pptData.notes}<p class="notes">{$pptData.notes}</p>{/if}
            </div>
        {/if}
    </div>
{/if}

<style>
    .ppt {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 50;
        max-height: 60vh;
        display: flex;
        flex-direction: column;
        background-color: var(--primary-darkest);
        border-top: 2px solid var(--secondary);
        box-shadow: 0 -4px 12px rgb(0 0 0 / 0.4);
    }

    @media (min-width: 1000px) {
        .ppt {
            left: auto;
            right: 8px;
            bottom: 8px;
            width: 380px;
            border: 2px solid var(--secondary);
            border-radius: 8px;
            overflow: hidden;
        }
    }

    .bar {
        display: flex;
        align-items: stretch;
    }

    .bar button {
        color: var(--text);
        background: transparent;
        border: none;
        cursor: pointer;
        font: inherit;
    }

    .icon {
        padding: 10px 18px;
    }

    .title {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
    }

    .name {
        opacity: 0.7;
    }

    .counter {
        font-weight: bold;
        font-size: 1.1em;
    }

    .content {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 0 8px 8px;
        overflow-y: auto;
    }

    img {
        width: 100%;
        aspect-ratio: 16 / 9;
        object-fit: contain;
        background: black;
        border-radius: 4px;
    }

    .empty {
        display: flex;
        align-items: center;
        justify-content: center;
        aspect-ratio: 16 / 9;
        opacity: 0.5;
    }

    p {
        margin: 0;
        white-space: pre-wrap;
    }

    .slide-title {
        font-weight: bold;
    }

    .notes {
        opacity: 0.85;
        font-size: 0.95em;
    }
</style>
