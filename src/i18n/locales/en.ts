import { account } from '../qubdi/account';
import { adminProjects } from '../qubdi/admin-projects';
import { adminUsers } from '../qubdi/admin-users';
import { database } from '../qubdi/database';
import { sidePanel } from '../qubdi/side-panel';
import { workspace } from '../qubdi/workspace';

// English is bundled and is the fallback for every other language. Editor
// strings are added in Phase 7.
export const en = {
    translation: {
        menu: {
            actions: {
                save: 'Save',
            },
        },
        qubdi: {
            account,
            sidePanel,
            database,
            workspace,
            adminUsers,
            adminProjects,
        },
    },
};
