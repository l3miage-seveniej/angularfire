import { Rule, SchematicContext, SchematicsException, Tree } from '@angular-devkit/schematics';
import { overwriteIfExists, safeReadJSON, stringifyFormatted } from 'src/schematics/ng-add-common';

import { default as defaultDependencies, firebaseFunctions } from '../../versions.json';

export const ngUpdate = (): Rule => (
    host: Tree,
    context: SchematicContext
) => {
    const packageJson = host.exists('package.json') && safeReadJSON('package.json', host);

    if (packageJson === undefined) {
        throw new SchematicsException('Could not locate package.json');
    }

    Object.keys(defaultDependencies).forEach(depName => {
        const dep = defaultDependencies[depName];
        if (dep.dev) {
            packageJson.devDependencies[depName] = dep.version;
        } else {
            packageJson.dependencies[depName] = dep.version;
        }
    });

    // TODO test if it's a SSR project in the JSON
    Object.keys(firebaseFunctions).forEach(depName => {
        const dep = firebaseFunctions[depName];
        if (dep.dev) {
            packageJson.devDependencies[depName] = dep.version;
        } else {
            packageJson.dependencies[depName] = dep.version;
        }
    });

    overwriteIfExists(host, 'package.json', stringifyFormatted(packageJson));

    host.visit(filePath => {
        if (!filePath.endsWith('.ts')) {
            return;
        }
        const content = host.read(filePath);
        if (!content) {
            return;
        }
        // rewrite imports from `@angular/fire/*` to `@angular/fire/compat/*`
        // rewrite imports from `firebase/*` to `firebase/compat/*`
        // rewrite imports from `@firebase/*` to `@firebase/compat/*`
        console.log(filePath);
    });

    console.log('Called ng-update');
    return host;
};