import appIcon from "../../assets/images/app-icon.png";
import { resolveResource } from "@tauri-apps/api/path";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";

async function openBundledDoc(fileName) {
  try {
    const fullPath = await resolveResource(`docs/${fileName}`);
    console.log("RavenWatch: resolved bundled doc path:", fullPath);
    await openPath(fullPath);
    console.log("RavenWatch: opened bundled doc:", fileName);
  } catch (error) {
    console.error(`RavenWatch: failed to open bundled doc: ${fileName}`, error);
    alert(`Could not open ${fileName}. Check devtools console for details.`);
  }
}

export async function openReadmeDoc() {
  await openBundledDoc("readme.html");
}

export async function openChangelogDoc() {
  await openBundledDoc("changelog.html");
}

export async function openArchitectProfile(event) {
  if (event) event.preventDefault();

  try {
    await openUrl("https://www.torn.com/profiles.php?XID=3893414");
    console.log("RavenWatch: opened architect profile");
  } catch (error) {
    console.error("RavenWatch: failed to open architect profile", error);
    alert("Could not open architect profile. Check devtools console.");
  }
}

export function renderInfoTab() {
  return `
    <div class="card">
      <h2>RavenWatch</h2>
      <p><strong>Real-time faction intelligence for Torn players.</strong></p>

      <p>
        RavenWatch is a lightweight desktop app designed to give you fast, clear visibility into your faction’s activity, including chain status, travel opportunities, and key financial data, without needing to dig through multiple pages.
      </p>

      <p>
        Built with performance and clarity in mind, RavenWatch focuses on delivering the information that matters most during active play, especially in war scenarios.
      </p>
    </div>

    <div class="card">
      <h3>About the Architect</h3>
      <p>
        <span class="info-text">
          Designed and built by
          <a
            href="#"
            id="infoArchitectLink"
            rel="noopener noreferrer"
          >Sarinja</a>,
          a systems-focused developer with a background in accounting, technology, and structured problem solving.
        </span>
      </p>

      <p>
        RavenWatch reflects a practical approach to tooling: clear data, fast access, and no unnecessary complexity. Donations of xanax, edvds, FHCs, or business class tickets always welcome (especially if you were given this by someone who is not me). Comments and questions can be directed to me in Torn.
      </p>
    </div>

    <div class="card info-image-card">
      <img src="${appIcon}" alt="RavenWatch Icon" class="info-image" />

      <div class="info-doc-links">
        <button id="openReadmeBtn" class="info-doc-link" type="button">Readme</button>
        <button id="openChangelogBtn" class="info-doc-link" type="button">Changelog</button>
      </div>
    </div>
  `;
}