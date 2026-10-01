---
title: Introduction to ad hoc commands
product: ansible
source_url: https://docs.ansible.com/ansible/latest/command_guide/intro_adhoc.html
source_path: ansible/ansible-documentation:docs/docsite/rst/command_guide/intro_adhoc.rst
---

# Introduction to ad hoc commands

An Ansible ad hoc command uses the <span class="title-ref">/usr/bin/ansible</span> command-line tool to automate a single task on one or more managed nodes.
ad hoc commands are quick and easy, but they are not reusable.
So why learn about ad hoc commands?
ad hoc commands demonstrate the simplicity and power of Ansible.
The concepts you learn here will port over directly to the playbook language.
Before reading and executing these examples, please read [How to build your inventory](../inventory_guide/intro_inventory.md).

## Why use ad hoc commands?

ad hoc commands are great for tasks you repeat rarely. For example, if you want to power off all the machines in your lab when you go on vacation, you could execute a quick one-liner in Ansible without writing a playbook. An ad hoc command looks like this:

``` bash
$ ansible [pattern] -m [module] -a "[module options]"
```

The `-a` option accepts options either through the `key=value` syntax or a JSON string starting with `{` and ending with `}` for more complex option structure.
You can learn more about [patterns](../inventory_guide/intro_patterns.md) and [modules](../_reference/plugins/module.md) on other pages.

## Use cases for ad hoc tasks

ad hoc tasks can be used to reboot servers, copy files, manage packages and users, and much more. You can use any Ansible module in an ad hoc task. ad hoc tasks, like playbooks, use a declarative model,
calculating and executing the actions required to reach a specified final state. They
achieve a form of idempotence by checking the current state before they begin and doing nothing unless the current state is different from the specified final state.

### Rebooting servers

The default module for the `ansible` command-line utility is the ansible.builtin.command module. You can use an ad hoc task to call the command module and reboot all web servers in Atlanta, 10 at a time. Before Ansible can do this, you must have all servers in Atlanta listed in a group called \[atlanta\] in your inventory, and you must have working SSH credentials for each machine in that group. To reboot all the servers in the \[atlanta\] group:

``` bash
$ ansible atlanta -a "/sbin/reboot"
```

By default, Ansible uses only five simultaneous processes. If you have more hosts than the value set for the fork count, it can increase the time it takes for Ansible to communicate with the hosts. To reboot the \[atlanta\] servers with 10 parallel forks:

``` bash
$ ansible atlanta -a "/sbin/reboot" -f 10
```

/usr/bin/ansible will default to running from your user account. To connect as a different user:

``` bash
$ ansible atlanta -a "/sbin/reboot" -f 10 -u username
```

Rebooting probably requires privilege escalation. You can connect to the server as `username` and run the command as the `root` user by using the [become](../playbook_guide/playbooks_privilege_escalation.md) keyword:

``` bash
$ ansible atlanta -a "/sbin/reboot" -f 10 -u username --become [--ask-become-pass]
```

If you add `--ask-become-pass` or `-K`, Ansible prompts you for the password to use for privilege escalation (sudo/su/pfexec/doas/etc).


> [!NOTE]
>
> The command module does not support extended shell syntaxes like piping and
> redirects (although shell variables will always work). If your command requires shell-specific
> syntax, use the <span class="title-ref">shell</span> module instead.


So far all our examples have used the default 'command' module. To use a different module, pass `-m` for module name. For example, to use the ansible.builtin.shell module:

``` bash
$ ansible raleigh -m ansible.builtin.shell -a 'echo $TERM'
```

When running any command with the Ansible *ad hoc* CLI (as opposed to
[Playbooks](../playbook_guide/playbooks.md)), pay particular attention to shell quoting rules, so
the local shell retains the variable and passes it to Ansible.
For example, using double rather than single quotes in the above example would
evaluate the variable on the box you were on.

### Managing files

An ad hoc task can harness the power of Ansible and SCP to transfer many files to multiple machines in parallel. To transfer a file directly to all servers in the \[atlanta\] group:

``` bash
$ ansible atlanta -m ansible.builtin.copy -a "src=/etc/hosts dest=/tmp/hosts"
```

If you plan to repeat a task like this, use the ansible.builtin.template module in a playbook.

The ansible.builtin.file module allows changing ownership and permissions on files. These
same options can be passed directly to the `copy` module as well:

``` bash
$ ansible webservers -m ansible.builtin.file -a "dest=/srv/foo/a.txt mode=600"
$ ansible webservers -m ansible.builtin.file -a "dest=/srv/foo/b.txt mode=600 owner=mdehaan group=mdehaan"
```

The `file` module can also create directories, similar to `mkdir -p`:

``` bash
$ ansible webservers -m ansible.builtin.file -a "dest=/path/to/c mode=755 owner=mdehaan group=mdehaan state=directory"
```

As well as delete directories (recursively) and delete files:

``` bash
$ ansible webservers -m ansible.builtin.file -a "dest=/path/to/c state=absent"
```

### Managing packages

You might also use an ad hoc task to install, update, or remove packages on managed nodes using a package management module such as `yum`. Package management modules support common functions to install, remove, and generally manage packages. Some specific functions for a package manager might not be present in the Ansible module since they are not part of general package management.

To ensure a package is installed without updating it:

``` bash
$ ansible webservers -m ansible.builtin.yum -a "name=acme state=present"
```

To ensure a specific version of a package is installed:

``` bash
$ ansible webservers -m ansible.builtin.yum -a "name=acme-1.5 state=present"
```

To ensure a package is at the latest version:

``` bash
$ ansible webservers -m ansible.builtin.yum -a "name=acme state=latest"
```

To ensure a package is not installed:

``` bash
$ ansible webservers -m ansible.builtin.yum -a "name=acme state=absent"
```

Ansible has modules for managing packages under many platforms. If there is no module for your package manager, you can install packages using the command module or create a module for your package manager.

### Managing users and groups

You can create, manage, and remove user accounts on your managed nodes with ad hoc tasks:

``` bash
$ ansible all -m ansible.builtin.user -a "name=foo password=<encrypted password here>"

$ ansible all -m ansible.builtin.user -a "name=foo state=absent"
```

See the ansible.builtin.user module documentation for details on all of the available options, including
how to manipulate groups and group membership.

### Managing services

Ensure a service is started on all webservers:

``` bash
$ ansible webservers -m ansible.builtin.service -a "name=httpd state=started"
```

Alternatively, restart a service on all webservers:

``` bash
$ ansible webservers -m ansible.builtin.service -a "name=httpd state=restarted"
```

Ensure a service is stopped:

``` bash
$ ansible webservers -m ansible.builtin.service -a "name=httpd state=stopped"
```

### Gathering facts

Facts represent discovered variables about a system. You can use facts to implement conditional execution of tasks but also just to get ad hoc information about your systems. To see all facts:

``` bash
$ ansible all -m ansible.builtin.setup
```

You can also filter this output to display only certain facts, see the ansible.builtin.setup module documentation for details.

### Check mode

In check mode, Ansible does not make any changes to remote systems. Ansible prints the commands only. It does not run the commands.

``` bash
$  ansible all -m copy -a "content=foo dest=/root/bar.txt" -C
```

Enabling check mode (`-C` or `--check`) in the above command means Ansible does not actually create or update the `/root/bar.txt` file on any remote systems.

### Patterns and ad-hoc commands

See the [patterns](../inventory_guide/intro_patterns.md) documentation for details on all of the available options, including
how to limit using patterns in ad-hoc commands.

Now that you understand the basic elements of Ansible execution, you are ready to learn to automate repetitive tasks using [Ansible Playbooks](../playbook_guide/playbooks_intro.md).


> [!NOTE]
>
> See also
> [Configuring Ansible](../installation_guide/intro_configuration.md)
> All about the Ansible config file
> list_of_collections
> Browse existing collections, modules, and plugins
> [Working with playbooks](../playbook_guide/playbooks.md)
> Using Ansible for configuration management & deployment
> Communication
> Got questions? Need help? Want to share your ideas? Visit the Ansible communication guide
