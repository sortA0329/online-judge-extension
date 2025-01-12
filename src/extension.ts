import * as vscode from "vscode";
import * as path from "node:path";
import * as copyPaste from "copy-paste";
import { services, service_url, async_exec, file_exists, get_config_checking, select_service, make_file_folder_name } from "./global";
import { check_oj_version, check_oj_api_version, check_oj_verify_version } from "./checker";
import { setup_command } from "./setup";
import { login_command } from "./login";
import { logout_command } from "./logout";

async function get_template(): Promise<[vscode.Uri | undefined, string]> {
    const template_path = get_config_checking<string>("templateFile");
    let template_uri: vscode.Uri | undefined = undefined;
    let file_or_command = "Main";
    if (template_path !== "") {
        template_uri = vscode.Uri.file(template_path);
        const ft = await file_exists(template_uri);
        if (ft !== vscode.FileType.File) {
            if (ft === vscode.FileType.Directory) {
                throw new Error('"Template File" path is a directory, not a file.');
            } else if (ft === vscode.FileType.SymbolicLink) {
                throw new Error('"Template File" path is a symbolic link, not a file.');
            } else {
                throw new Error('The file pointed to by "Template File" path does not exist.');
            }
        }
        file_or_command = path.basename(template_path);
    }
    return [template_uri, file_or_command];
}

async function get_contest_data(service: number, contest_id: string) {
    let contest_url = service_url[service];
    if (service === services.Atcoder || service === services.yukicoder) {
        contest_url += `contests/${contest_id}/`;
    } else if (service === services.Atcoder_Problems) {
        contest_url += `#/contest/show/${contest_id}/`;
    } else if (service === services.CodeChef) {
        contest_url += contest_id + "/";
    } else if (service === services.Codeforces) {
        contest_url += `contest/${contest_id}/`;
    }
    const { error, stdout, stderr } = await async_exec(`oj-api --wait=0.0 get-contest ${contest_url}`);
    if (stdout !== "") {
        console.log(stdout);
    }
    if (stderr !== "") {
        console.error(stderr);
    }

    let contest = JSON.parse(stdout);
    if (contest.status === "ok") {
        return { contest: contest, dirname: make_file_folder_name(contest.result.name), stat: "summary" };
    } else if (service === services.Atcoder) {
        let n = 0;
        let s = 0;
        let f2 = false;
        let name = "";
        if (/abc[0-9]{3}/.test(contest_id)) {
            let abc = Number(contest_id.substring(3));
            if (abc <= 125) {
                n = 4;
            } else if (abc <= 211) {
                n = 6;
            } else if (abc <= 318) {
                n = 8;
            } else {
                n = 7;
            }
            name = `AtCoder Beginner Contest ${abc}`;
        } else if (/arc[0-9]{3}/.test(contest_id)) {
            let arc = Number(contest_id.substring(3));
            if (arc <= 57) {
                n = 4;
            } else {
                n = 6;
                if (arc <= 104) {
                    s = 2;
                }
                if (arc === 120) {
                    f2 = true;
                }
            }
            name = `AtCoder Regular Contest ${arc}`;
        } else if (/agc[0-9]{3}/.test(contest_id)) {
            let agc = Number(contest_id.substring(3));
            n = 6;
            if (agc === 28) {
                f2 = true;
            }
            name = `AtCoder Grand Contest ${agc}`;
        } else if (/ahc[0-9]{3}/.test(contest_id)) {
            n = 1;
            name = `AtCoder Heuristic Contest ${contest_id.substring(3)}`;
        } else {
            const cnt = await vscode.window.showInputBox({
                ignoreFocusOut: true,
                placeHolder: "ex) 7",
                prompt: "Enter the number of problems. (1-26)",
            });
            if (cnt === undefined || cnt === "") {
                return { contest: contest, dirname: "", stat: undefined };
            }
            n = Number(cnt);
            if (!Number.isInteger(n) || n < 1 || n > 26) {
                throw new Error("Incorrect input. Enter an integer between 1 and 26.");
            }
            name = "Atcoder_" + contest_id;
        }
        let problem_id: string[] = [];
        for (let i = s; i < n; ++i) {
            problem_id.push(String.fromCharCode("a".charCodeAt(0) + i));
        }
        if (f2) {
            problem_id.push("f2");
        }
        contest.status = "guess";
        contest.result = {
            url: `https://atcoder.jp/contests/${contest_id}`,
            name: null,
            problems: [],
        };
        problem_id.forEach((id) =>
            contest.result.problems.push({
                url: `https://atcoder.jp/contests/${contest_id}/${contest_id.replaceAll("-", "_")}_${id}`,
                name: null,
                context: {
                    contest: {
                        url: `https://atcoder.jp/contests/${contest_id}`,
                        name: null,
                    },
                    alphabet: id.toUpperCase(),
                },
            })
        );
        return { contest: contest, dirname: make_file_folder_name(name), stat: "guess" };
    } else if (service === services.Codeforces) {
        const cnt = await vscode.window.showInputBox({
            ignoreFocusOut: true,
            placeHolder: "ex) 7",
            prompt: "Enter the number of problems. (1-26)",
        });
        if (cnt === undefined || cnt === "") {
            return { contest: contest, dirname: "", stat: undefined };
        }
        const n = Number(cnt);
        if (!Number.isInteger(n) || n < 1 || n > 26) {
            throw new Error("Incorrect input. Enter an integer between 1 and 26.");
        }
        contest.status = "guess";
        contest.result = {
            url: `https://codeforces.com/contest/${contest_id}`,
            name: null,
            problems: [],
        };
        for (let i = 0; i < n; ++i) {
            const id = String.fromCharCode("A".charCodeAt(0) + i);
            contest.result.problems.push({
                url: `https://codeforces.com/contest/${contest_id}/problem/${id}`,
                name: null,
                context: {
                    contest: {
                        url: `https://atcoder.jp/contests/${contest_id}`,
                        name: null,
                    },
                    alphabet: id,
                },
            });
        }
        return { contest: contest, dirname: make_file_folder_name("Codeforces_" + contest_id), stat: "guess" };
    } else if (service === services.CodeChef) {
        contest.status = "guess";
        contest.result = {
            url: `https://www.codechef.com/${contest_id}`,
            name: null,
            problems: [],
        };
        return { contest: contest, dirname: make_file_folder_name(contest_id), stat: "guess" };
    } else {
        throw new Error("Could not retrieve contest information.");
    }
}

async function get_problem_data(url: string) {
    if (url.includes("judge.yosupo.jp")) {
        vscode.window.showInformationMessage("Please wait a moment...");
    }
    const { error, stdout, stderr } = await async_exec(`oj-api --wait=0.0 get-problem ${url}`);
    if (stdout !== "") {
        console.log(stdout);
    }
    if (stderr !== "") {
        console.error(stderr);
    }
    if (error) {
        throw new Error("Something went wrong.");
    }
    const problem = JSON.parse(stdout);
    let name = "";
    if ("name" in problem.result) {
        name = problem.result.name;
    } else {
        if (problem.result.url.startsWith("http://judge.u-aizu.ac.jp")) {
            name = problem.result.url.split("=").at(-1);
        } else if (problem.result.url.startsWith("http://golf.shinh.org")) {
            name = problem.result.url.split("?").at(-1).replaceAll("+", " ");
        } else if (problem.result.url.startsWith("https://csacademy.com")) {
            name = problem.result.url.split("/").at(-2);
        } else if (problem.result.url.startsWith("https://www.facebook.com")) {
            const v = problem.result.url.split("/");
            name = v.at(-4) + "-" + v.at(-3) + "-" + v.at(-1);
        } else if (problem.result.url.startsWith("http://poj.org/")) {
            name = problem.result.url.split("?").at(-1);
        } else {
            name = problem.result.url.split("/").at(-1);
        }
    }
    return { problem, name };
}

function hide_filepath(code: string) {
    return code.replaceAll(/#line\s(\d+)\sR?".*"/g, "#line $1");
}

function erase_line_directives(code: string) {
    return code.replaceAll(/#line\s\d+(\sR?".*")?/g, "");
}

async function bundle_code(target: vscode.Uri) {
    const config_include_path = get_config_checking<string[]>("includePath");
    const config_hide_path = get_config_checking<boolean>("hidePath");
    const config_erase_line_directives = get_config_checking<boolean>("eraseLineDirectives");
    const { error, stdout, stderr } = await async_exec(`cd ${path.dirname(target.fsPath)} && oj-bundle ${target.fsPath}${config_include_path.map((value) => " -I " + value).join("")}`);
    if (stderr !== "") {
        console.error(stderr);
    }
    if (error) {
        throw new Error("Failed to bundle the file.");
    }
    return config_erase_line_directives ? erase_line_directives(stdout) : config_hide_path ? hide_filepath(stdout) : stdout;
}

async function submit_code(target: vscode.Uri, problem: string) {
    const config_cxx_latest = get_config_checking<boolean>("guessC++Latest");
    const config_cxx_compiler = get_config_checking<string>("guessC++Compiler");
    const config_py_version = get_config_checking<string>("guessPythonVersion");
    const config_py_interpreter = get_config_checking<string>("guessPythonInterpreter");
    const config_bundle = get_config_checking<boolean>("bundleBeforeSubmission");
    const config_open_brower = get_config_checking<boolean>("openBrowser");
    if (config_cxx_latest === undefined || config_cxx_compiler === undefined || config_py_version === undefined || config_py_interpreter === undefined || config_bundle === undefined || config_open_brower === undefined) {
        return;
    }
    const cxx_latest = config_cxx_latest ? "--guess-cxx-latest" : "--no-guess-latest";
    const cxx_compiler = "--guess-cxx-compiler " + (config_cxx_compiler === "GCC" ? "gcc" : config_cxx_compiler === "Clang" ? "clang" : "all");
    const py_version = "--guess-python-version " + (config_py_version === "Python2" ? "2" : config_py_version === "Python3" ? "3" : config_py_version === "Auto" ? "auto" : "all");
    const py_interpreter = "--guess-python-interpreter " + (config_py_interpreter === "CPython" ? "cpython" : config_py_interpreter === "PyPy" ? "pypy" : "all");
    const open_brower = config_open_brower ? "--open" : "--no-open";

    const do_bundle = config_bundle && [".c", ".C", ".cc", ".cp", ".cpp", ".cxx", ".c++", ".h", ".H", ".hh", ".hp", ".hpp", ".hxx", ".h++"].includes(path.extname(target.fsPath));
    let del_target = false;
    if (do_bundle) {
        del_target = true;
        const bundled = await bundle_code(target);
        target = vscode.Uri.joinPath(target, `../${path.basename(target.fsPath)}.bundled${path.extname(target.fsPath)}`);
        await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(bundled));
    } else {
        const config_erase_line_directives = get_config_checking<boolean>("eraseLineDirectives");
        const config_hide_path = get_config_checking<boolean>("hidePath");
        if (config_erase_line_directives || config_hide_path) {
            del_target = true;
            const code = new TextDecoder().decode(await vscode.workspace.fs.readFile(target));
            const new_target = vscode.Uri.joinPath(target, `../${path.basename(target.fsPath)}.bundled${path.extname(target.fsPath)}`);
            await vscode.workspace.fs.writeFile(new_target, new TextEncoder().encode(config_erase_line_directives ? erase_line_directives(code) : hide_filepath(code)));
            target = new_target;
        }
    }
    const { error, stdout, stderr } = await async_exec(`oj submit --wait 0 --yes ${cxx_latest} ${cxx_compiler} ${py_version} ${py_interpreter} ${open_brower} ${problem} ${target.fsPath}`);
    if (del_target) {
        vscode.workspace.fs.delete(target);
    }
    if (stdout !== "") {
        console.log(stdout);
    }
    if (stderr !== "") {
        console.error(stderr);
    }
    if (error) {
        throw new Error("Something went wrong.");
    }
}

export async function activate(context: vscode.ExtensionContext) {
    console.log('"Online Judge Extension" is now active!');

    context.subscriptions.push(setup_command);
    context.subscriptions.push(login_command);
    context.subscriptions.push(logout_command);

    let createdir = vscode.commands.registerCommand("online-judge-extension.createdir", async (target_directory: vscode.Uri) => {
        if (!(await check_oj_api_version())) {
            return;
        }

        const template = await get_template();
        if (template === undefined) {
            return;
        }
        const [template_uri, file_or_command] = template;

        const service = await select_service([services.Atcoder, services.Atcoder_Problems, services.CodeChef, services.Codeforces, services.yukicoder]);
        if (service === undefined) {
            return;
        }
        const contest_id = await vscode.window.showInputBox({
            ignoreFocusOut: true,
            placeHolder: "ex) abc001",
            prompt: "Enter the contest id.",
        });
        if (contest_id === undefined || contest_id === "") {
            return;
        }

        const { contest, dirname, stat } = await get_contest_data(service, contest_id);
        if (stat === undefined) {
            return;
        }
        if (service === services.Atcoder) {
            contest.result.problems = contest.result.problems.filter((problem: any) => !("alphabet" in problem.context && problem.context.alphabet === "A-Final"));
        }
        const dir = vscode.Uri.joinPath(target_directory, dirname);
        vscode.workspace.fs.createDirectory(dir);
        vscode.workspace.fs.writeFile(vscode.Uri.joinPath(dir, "contest.oj-ext.json"), new TextEncoder().encode(JSON.stringify(contest, null, 4)));
        contest.result.problems.forEach(async (problem: any, index: number) => {
            problem.status = stat;
            const dir2 = vscode.Uri.joinPath(dir, "alphabet" in problem.context ? problem.context.alphabet : String(index) + " " + problem.name);
            await vscode.workspace.fs.createDirectory(dir2);
            vscode.workspace.fs.writeFile(vscode.Uri.joinPath(dir2, "problem.oj-ext.json"), new TextEncoder().encode(JSON.stringify(problem, null, 4)));
            const file = vscode.Uri.joinPath(dir2, file_or_command);
            if (template_uri === undefined) {
                vscode.workspace.fs.writeFile(file, new Uint8Array());
            } else {
                vscode.workspace.fs.copy(template_uri, file);
            }
        });
    });
    context.subscriptions.push(createdir);

    let addproblem = vscode.commands.registerCommand("online-judge-extension.addproblem", async (target_directory: vscode.Uri) => {
        if (!(await check_oj_api_version())) {
            return;
        }

        const template = await get_template();
        if (template === undefined) {
            return;
        }
        const [template_uri, file_or_command] = template;
        if (await file_exists(vscode.Uri.joinPath(target_directory, "contest.oj-ext.json"))) {
            vscode.window.showErrorMessage("Something went wrong.");
            return;
        }

        const problem_url = await vscode.window.showInputBox({
            ignoreFocusOut: true,
            placeHolder: "ex) https://codeforces.com/contest/1606/problem/A",
            prompt: "Enter the problem url.",
        });
        if (problem_url === undefined || problem_url === "") {
            return;
        }
        const { problem, name } = await get_problem_data(problem_url);
        const dir = vscode.Uri.joinPath(target_directory, make_file_folder_name(name));
        await vscode.workspace.fs.createDirectory(dir);
        vscode.workspace.fs.writeFile(vscode.Uri.joinPath(dir, "problem.oj-ext.json"), new TextEncoder().encode(JSON.stringify(problem, null, 4)));
        const file = vscode.Uri.joinPath(dir, file_or_command);
        if (template_uri === undefined) {
            vscode.workspace.fs.writeFile(file, new Uint8Array());
        } else {
            vscode.workspace.fs.copy(template_uri, file);
        }
    });
    context.subscriptions.push(addproblem);

    let update = vscode.commands.registerCommand("online-judge-extension.update", async (target_directory: vscode.Uri) => {
        if (!(await check_oj_api_version())) {
            return;
        }

        if (await file_exists(vscode.Uri.joinPath(target_directory, "contest.oj-ext.json"))) {
            const template = await get_template();
            if (template === undefined) {
                return;
            }
            const [template_uri, file_or_command] = template;

            const url: string = JSON.parse((await vscode.workspace.fs.readFile(vscode.Uri.joinPath(target_directory, "contest.oj-ext.json"))).toString()).result.url;
            const service: number = Number(Object.keys(service_url).find((value) => url.startsWith(service_url[Number(value)])));
            const contest_id = url.split("/").at(-1);
            if (contest_id === undefined) {
                throw new Error("Faild to extract contest id from url.");
            }

            const { contest, dirname, stat } = await get_contest_data(service, contest_id);
            if (stat === undefined) {
                return;
            }
            if (path.basename(target_directory.fsPath) !== dirname) {
                const new_uri = vscode.Uri.joinPath(target_directory, "../" + dirname);
                await vscode.workspace.fs.rename(target_directory, new_uri);
                target_directory = new_uri;
            }
            if (service === services.Atcoder) {
                contest.result.problems = contest.result.problems.filter((problem: any) => !("alphabet" in problem.context && problem.context.alphabet === "A-Final"));
            }
            vscode.workspace.fs.writeFile(vscode.Uri.joinPath(target_directory, "contest.oj-ext.json"), new TextEncoder().encode(JSON.stringify(contest, null, 4)));
            contest.result.problems.forEach(async (problem: any, index: number) => {
                problem.status = stat;
                const dir = vscode.Uri.joinPath(target_directory, "alphabet" in problem.context ? problem.context.alphabet : String(index) + " " + problem.name);
                if ((await file_exists(dir)) !== vscode.FileType.Directory) {
                    await vscode.workspace.fs.createDirectory(dir);
                    const file = vscode.Uri.joinPath(dir, file_or_command);
                    if (template_uri === undefined) {
                        vscode.workspace.fs.writeFile(file, new Uint8Array());
                    } else {
                        vscode.workspace.fs.copy(template_uri, file);
                    }
                }
                vscode.workspace.fs.writeFile(vscode.Uri.joinPath(dir, "problem.oj-ext.json"), new TextEncoder().encode(JSON.stringify(problem, null, 4)));
            });
        } else if (await file_exists(vscode.Uri.joinPath(target_directory, "problem.oj-ext.json"))) {
            const template = await get_template();
            if (template === undefined) {
                return;
            }
            const [template_uri, file_or_command] = template;
            const url: string = JSON.parse((await vscode.workspace.fs.readFile(vscode.Uri.joinPath(target_directory, "problem.oj-ext.json"))).toString()).result.url;
            // TODO
        } else {
            throw new Error("Something went wrong.");
        }
    });
    context.subscriptions.push(update);

    let submit = vscode.commands.registerCommand("online-judge-extension.submit", async (target_file: vscode.Uri) => {
        if (!(await check_oj_version())) {
            return;
        }

        const problem_url = await vscode.window.showInputBox({
            ignoreFocusOut: true,
            placeHolder: "ex) https://codeforces.com/contest/1606/problem/A",
            prompt: "Enter the problem url.",
        });
        if (problem_url === undefined) {
            return;
        }
        submit_code(target_file, problem_url);
    });
    context.subscriptions.push(submit);

    let bundle = vscode.commands.registerCommand("online-judge-extension.bundle", async (target_file: vscode.Uri) => {
        if (!(await check_oj_verify_version())) {
            return;
        }

        vscode.window.withProgress(
            {
                title: `Bundling ${path.basename(target_file.fsPath)}`,
                location: vscode.ProgressLocation.Notification,
                cancellable: false,
            },
            async (progress) => {
                return new Promise(async (resolve, reject) => {
                    let interval: any;
                    let loopCounter = 1;
                    progress.report({ message: "working." });
                    interval = setInterval(() => {
                        loopCounter++;
                        if (loopCounter > 3) {
                            loopCounter = 1;
                        }
                        progress.report({ message: "working" + ".".repeat(loopCounter) });
                    }, 300);
                    let bundled: string;
                    try {
                        bundled = await bundle_code(target_file);
                    } catch (error: any) {
                        reject(error);
                        return;
                    }
                    copyPaste.copy(bundled, () => {
                        clearInterval(interval);
                        progress.report({ message: "copied to clipboard." });
                        setTimeout(() => resolve(null), 2500);
                    });
                });
            }
        );
    });
    context.subscriptions.push(bundle);
}

export function deactivate() {}
