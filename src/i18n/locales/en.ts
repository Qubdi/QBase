import { canvas } from '../canvas-strings';
import { account } from '../qubdi/account';
import { adminProjects } from '../qubdi/admin-projects';
import { adminUsers } from '../qubdi/admin-users';
import { database } from '../qubdi/database';
import { workspace } from '../qubdi/workspace';
import { diagnosticsStrings } from '../editor/diagnostics';
import { designsStrings } from '../editor/designs';
import { exportingStrings } from '../editor/exporting';
import { importingStrings } from '../editor/importing';
import { settingsStrings } from '../editor/settings';
import { sidePanelStrings } from '../editor/side-panel';
import { workspaceStrings } from '../editor/workspace';

// English is bundled and is the fallback for every other language. The editor's
// own wording lives in ../editor/*, one file per area, and is merged here.
export const en = {
    translation: {
        menu: {
            actions: {
                save: 'Save',
            },
        },
        editor: {
            common: workspaceStrings.common,
            workspace: workspaceStrings.workspace,
            designs: designsStrings,
            diagnostics: diagnosticsStrings,
            importing: importingStrings,
            exporting: exportingStrings,
            settings: settingsStrings,
            sidePanel: sidePanelStrings,
        },
        canvas,
        qubdi: {
            account,
            database,
            workspace,
            adminUsers,
            adminProjects,
        },
    },
};
