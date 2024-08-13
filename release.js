import fs from 'fs';
import { execSync } from 'child_process';

const newVersion = process.argv[2];
if (!newVersion) {
    console.error('Please provide a new version.');
    process.exit(1);
}

const updatePackageJson = (filePath) => {
    const packageJson = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    packageJson.version = newVersion;
    fs.writeFileSync(filePath, JSON.stringify(packageJson, null, 2) + '\n');
    console.log(`Updated version in ${filePath}`);
};

const updateMainJs = (filePath) => {
    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replace(/const DEV = true;/, 'const DEV = false;');
    content = content.replace(/const DEBUG = true;/, 'const DEBUG = false;');
    fs.writeFileSync(filePath, content);
    console.log(`Updated DEV and DEBUG in ${filePath}`);
};

try {
    updatePackageJson('package.json');
    updatePackageJson('frontend/package.json');
    updateMainJs('main.js');

    execSync('git add package.json frontend/package.json main.js');

    // Check if there are changes to commit
    const changes = execSync('git diff-index --cached HEAD').toString().trim();
    if (changes) {
        execSync(`git commit -m "Release v${newVersion}"`, { stdio: 'inherit' });
    } else {
        console.log('No changes to commit.');
    }

    execSync('git push', { stdio: 'inherit' });
    execSync(`git tag -a v${newVersion} -m "Release v${newVersion}"`, { stdio: 'inherit' });
    execSync(`git push origin v${newVersion}`, { stdio: 'inherit' });

    console.log('Release process completed successfully.');
} catch (error) {
    console.error('Error during release process:', error);
    process.exit(1);
}