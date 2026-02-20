import type { Context } from "@b9g/crank";
import { Layout } from "./layout.tsx";
import { router } from "../src/router.ts";
import layoutStyles from "./layout.module.css";
import homeStyles from "./home.module.css";

function FeatureCards({ uploadSlot }: { uploadSlot?: Element }) {
  return (
    <section class={layoutStyles.grid}>
      <sl-card class={homeStyles.viewCard}>
        <div slot="header">
          <sl-icon name="wifi" label="Connect to live process"></sl-icon>
          <h3>Connect to Live Process</h3>
        </div>
        <div>
          Inspect a running Effection process in real-time via the running
          inspector connection
        </div>
        <div slot="footer">
          <a href="/live">
            <sl-button type="button" variant="default">
              Start Connection
            </sl-button>
          </a>
        </div>
      </sl-card>

      <sl-card class={homeStyles.viewCard}>
        <div slot="header">
          <sl-icon name="cloud-upload" label="Load recording" />
          <h3>Load Recording</h3>
        </div>
        <div>
          Analyze a previously recorded session with time-travel controls and
          playback
        </div>
        <div slot="footer">
          {uploadSlot}
          <div class={homeStyles.meta}>.json, .effection files</div>
        </div>
      </sl-card>

      <sl-card class={homeStyles.viewCard}>
        <div slot="header">
          <sl-icon name="play-fill" label="Try demo" />
          <h3>Try Demo</h3>
        </div>
        <div>
          <sl-badge slot="header" variant="info">
            Recommended
          </sl-badge>
          Explore the inspector with a sample process
        </div>
        <div slot="footer">
          <a href="/demo">
            <sl-button type="button" variant="primary">
              Launch Demo
            </sl-button>
          </a>
          <div class={homeStyles.meta}>Perfect for checking things out</div>
        </div>
      </sl-card>
    </section>
  );
}

export async function* Home(this: Context): AsyncGenerator<Element> {
  function RecordingUpload({ slot }: { slot?: string }) {
    return (
      <div slot={slot} class={homeStyles.recordingUpload}>
        <input
          type="file"
          id="file-input"
          class={homeStyles.hiddenFileInput}
          onChange={handleFileSelect}
          accept=".json,.effection,application/json,text/json"
          aria-label="Upload recording file"
        />
        <sl-button
          type="button"
          variant="neutral"
          onclick={() =>
            (document.getElementById("file-input") as HTMLInputElement).click()
          }
        >
          Browse files
        </sl-button>
      </div>
    );
  }
  const handleFileSelect = (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      router.navigate({ route: "recording", state: { file } });
    }
  };

  for ({} of this) {
    yield (
      <Layout>
        <main class={homeStyles.homeMain}>
          <FeatureCards uploadSlot={<RecordingUpload />} />
        </main>
      </Layout>
    );
  }
}
