---
title: Introduction to modules
product: ansible
source_url: https://docs.ansible.com/ansible/latest/module_plugin_guide/modules_intro.html
source_path: ansible/ansible-documentation:docs/docsite/rst/module_plugin_guide/modules_intro.rst
---

# Introduction to modules

Modules (also referred to as "task plugins" or "library plugins") are discrete units of code that can be used from the command line or in a playbook task. Ansible executes each module, usually on the remote managed node, and collects return values. In Ansible 2.10 and later, most modules are hosted in collections.

You can execute modules from the command line.

``` shell-session
ansible webservers -m service -a "name=httpd state=started"
ansible webservers -m ping
ansible webservers -m command -a "/sbin/reboot -t now"
```

Each module supports arguments. Nearly all modules take `key=value` arguments, space delimited. Some modules take no arguments, and the command/shell modules simply take the string of the command you want to run.

From playbooks, Ansible modules are executed in a very similar way.

``` yaml
- name: reboot the servers
  command: /sbin/reboot -t now
```

Another way to pass arguments to a module is using YAML syntax, also called 'complex args'.

``` yaml
- name: restart webserver
  service:
    name: httpd
    state: restarted
```

All modules return JSON format data. This means modules can be written in any programming language. Modules should be idempotent, and should avoid making any changes if they detect that the current state matches the desired final state. When used in an Ansible playbook, modules can trigger 'change events' in the form of notifying [handlers](../playbook_guide/playbooks_handlers.md) to run additional tasks.

You can access the documentation for each module from the command line with the ansible-doc tool.

``` shell-session
ansible-doc yum
```

For a list of all available modules, see the Collection docs, or run the following at a command prompt.

``` shell-session
ansible-doc -l
```

# Boolean variables

Ansible accepts a broad range of values for `bool` in module arguments: `true/false`, `1/0`, `yes/no`, `True/False` and so on. The matching of valid strings is case insensitive.
While documentation examples focus on `true/false` to be compatible with `ansible-lint` default settings, you can use any of the following:

<table>
<thead>
<tr class="header">
<th>Valid values</th>
<th>Description</th>
</tr>
</thead>
<tbody>
<tr class="odd">
<td><blockquote>
<p><code>True</code> , <code>'true'</code> , <code>'t'</code> , <code>'yes'</code> , <code>'y'</code> , <code>'on'</code> , <code>'1'</code> , <code>1</code> , <code>1.0</code></p>
</blockquote></td>
<td><blockquote>
<p>Truthy values</p>
</blockquote></td>
</tr>
<tr class="even">
<td><blockquote>
<p><code>False</code> , <code>'false'</code> , <code>'f'</code> , <code>'no'</code> , <code>'n'</code> , <code>'off'</code> , <code>'0'</code> , <code>0</code> , <code>0.0</code></p>
</blockquote></td>
<td><blockquote>
<p>Falsy values</p>
</blockquote></td>
</tr>
</tbody>
</table>


> [!NOTE]
>
> See also
> [Introduction to ad hoc commands](../command_guide/intro_adhoc.md)
> Examples of using modules in /usr/bin/ansible
> [Working with playbooks](../playbook_guide/playbooks.md)
> Examples of using modules with /usr/bin/ansible-playbook
> developing_modules
> How to write your own modules
> developing_api
> Examples of using modules with the Python API
> Communication
> Got questions? Need help? Want to share your ideas? Visit the Ansible communication guide
> [Indexes of all modules and plugins](../_reference/collections/all_plugins.md)
> All modules and plugins available
