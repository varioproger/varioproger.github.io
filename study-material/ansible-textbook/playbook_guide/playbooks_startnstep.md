---
title: Executing playbooks for troubleshooting
product: ansible
source_url: https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_startnstep.html
source_path: ansible/ansible-documentation:docs/docsite/rst/playbook_guide/playbooks_startnstep.rst
---

# Executing playbooks for troubleshooting

When you are testing new plays or debugging playbooks, you may need to run the same play multiple times. To make this more efficient, Ansible offers two alternative ways to execute a playbook: start-at-task and step mode.

## start-at-task

To start executing your playbook at a particular task (usually the task that failed on the previous run), use the `--start-at-task` option.

``` shell
ansible-playbook playbook.yml --start-at-task="install packages"
```

In this example, Ansible executes your playbook starting at a task named "install packages". If the play containing the task has play-level fact gathering or argument validation, the implicit play-level tasks execute first.


> [!WARNING]
>
> This feature does not work with tasks inside dynamically reused roles or tasks (`include_*`), see [Reusing Ansible artifacts](playbooks_reuse.md) or use ref:<span class="title-ref">step</span> to skip tasks and ref:<span class="title-ref">playbook_debugger</span> to redo tasks.


## Step mode

To execute a playbook interactively, use `--step`.

``` shell
ansible-playbook playbook.yml --step
```

With this option, Ansible stops on each task and asks if it should execute that task. For example, if you have a task called "configure ssh", the playbook run will stop and ask.

``` shell
Perform task: configure ssh (y/n/c):
```

Answer "y" to execute the task, answer "n" to skip the task, and answer "c" to exit step mode, executing all remaining tasks without asking.


> [!NOTE]
>
> See also
> [Ansible playbooks](playbooks_intro.md)
> An introduction to playbooks
> [Debugging tasks](playbooks_debugger.md)
> Using the Ansible debugger
