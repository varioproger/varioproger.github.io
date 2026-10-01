---
title: Managing Windows hosts with Ansible
product: ansible
source_url: https://docs.ansible.com/ansible/latest/os_guide/intro_windows.html
source_path: ansible/ansible-documentation:docs/docsite/rst/os_guide/intro_windows.rst
---

# Managing Windows hosts with Ansible

Managing Windows hosts is different from managing POSIX hosts. If you have managed nodes running Windows, review these topics.

This is an index of all the topics covered in this guide.

## Bootstrapping Windows

Windows nodes must be running Windows Server 2016 or Windows 10 or newer. As these versions of Windows ship with PowerShell 5.1 by default there are no additional requirements to bootstrap a Windows node.

Support for each Windows version is tied to the extended support lifecycle of each operating system, which is typically 10 years from the date of release. Ansible is tested against the server variants of Windows but should still be compatible with the desktop variants like Windows 10 and 11.

## Connecting to Windows nodes

Ansible connects to POSIX managed nodes using OpenSSH by default. Windows nodes can also use SSH but historically they use WinRM as the connection transport. The supported connection plugins that can be used with Windows nodes are:

- PowerShell Remoting over WinRM - psrp
- SSH - ssh
- Windows Remote Management - winrm

### PSRP and WinRM

Historically Ansible used Windows Remote Management (`WinRM`) as the connection protocol to manage Windows nodes. The `psrp` and `winrm` connection plugins both operate over WinRM and can be used as the connection plugin for Windows nodes. The `psrp` connection plugin is a newer connection plugin that offers a few benefits over the `winrm` connection plugin, for example:

- Can be slightly faster
- Less susceptible to timeout issues when the Windows node is under load
- Better support for proxy servers

See [Windows Remote Management](windows_winrm.md) for more information on how WinRM is configured and how to use the `psrp` and `winrm` connection plugins in Ansible.

### SSH

SSH is the traditional connection plugin used with POSIX nodes but it can also be used to manage Windows nodes instead of the traditional `psrp` or `winrm` connection plugins.


> [!NOTE]
>
> While Ansible has supported using the SSH connection plugin with Windows nodes since Ansible 2.8, official support was only added in version 2.18.


Some of the benefits of using SSH over the WinRM based transports are:

- SSH can be easier to configure in non-domain environments
- SSH supports key based authentication which is simpler to manage than certificates
- SSH file transfers are faster than WinRM

See [Windows SSH](windows_ssh.md) for more information on how to configure SSH for Windows nodes.

## Which modules are available?

The majority of the core Ansible modules are written for a combination of Unix-like machines and other generic services. As these modules are written in Python and use APIs not present on Windows they will not work.

There are dedicated Windows modules that are written in PowerShell and are meant to be run on Windows hosts. A list of these modules can be in the plugins_in_ansible.windows, plugins_in_community.windows, plugins_in_microsoft.ad, plugins_in_chocolatey.chocolatey, and other collections.

In addition, the following Ansible Core modules/action-plugins work with Windows:

- add_host
- assert
- async_status
- debug
- fail
- fetch
- group_by
- include
- include_role
- include_vars
- meta
- pause
- raw
- script
- set_fact
- set_stats
- setup
- slurp
- template (also: win_template)
- wait_for_connection

## Using Windows as the control node

Ansible cannot run on Windows as the control node due to API limitations on the platform. However, you can run Ansible on Windows using the Windows Subsystem for Linux (`WSL`) or in a container.


> [!NOTE]
>
> The Windows Subsystem for Linux is not supported by Ansible and should not be used for production systems.


## Windows facts

Ansible gathers facts from Windows in a similar manner to other POSIX hosts but with some differences. Some facts may be in a different format for backwards compatibility or may not be available at all.

To see the facts that Ansible gathers from Windows hosts, run the `setup` module.

``` bash
ansible windows -m setup
```

## Common Windows problems

### Command works locally but not under Ansible

Ansible executes commands through a network logon which can change how Windows authorizes actions. This can cause commands that work locally to fail under Ansible. Some examples of these failures are:

- the process cannot delegate the user's credentials to a network resource, causing `Access is  Denied` or `Resource Unavailable` errors
- applications that require an interactive session will not work
- some Windows APIs are restricted when running through a network logon
- some tasks require access to the `DPAPI` secrets store which is typically not available on a network logon

The common way is to use [Understanding privilege escalation: become](../playbook_guide/playbooks_privilege_escalation.md) to run a command with explicit credentials. Using `become` on Windows will change the network logon to an interactive one and, if explicit credentials are provided to the become identity, the command will be able to access network resources and unlock the `DPAPI` store.

Another option is to use an authentication option on the connection plugin that allows for credential delegation. For SSH this can be done with an explicit username and password or through a Kerberos/GSSAPI logon with delegation enabled. For WinRM based connections, the CredSSP or Kerberos with delegation can be used. See the connection specific documentation for more information.

### Credentials are rejected

There are a few reasons why credentials might be rejected when connecting to the Windows host. Some common reasons are:

- the username or password is incorrect
- the user account is locked out, disabled, not allowed to log onto that server
- the user account is not allowed to log on through the network
- the user account is not a member of the local Administrators group
- the user account is a local user and the `LocalAccountTokenFilterPolicy` is not set

To verify whether the credentials are correct or the user is allowed to log onto the host you can run the below PowerShell command on the Windows host to see the last failed logon attempt. This will output event details including the `Status` and `Sub Status` error code indicating why the logon failed.

``` powershell
Get-WinEvent -FilterHashtable @{LogName = 'Security'; Id = 4625} |
    Select-Object -First 1 -ExpandProperty Message
```

While not all connection plugins require the connection user to be a member of the local Administrators group, this is typically the default configuration. If the user is not a member of the local Administrators group or is a local user without `LocalAccountTokenFilterPolicy` set, the authentication will fail.


> [!NOTE]
>
> See also
> [Introduction to ad hoc commands](../command_guide/intro_adhoc.md)
> Examples of basic commands
> [Working with playbooks](../playbook_guide/playbooks.md)
> Learning Ansible's configuration management language
> developing_modules
> How to write modules
> [Windows App Control](windows_app_control.md)
> Using Ansible with Windows App Control managed hosts
> [Desired State Configuration](windows_dsc.md)
> Using Ansible with Windows Desired State Configuration
> [Windows performance](windows_performance.md)
> Performance considerations for managing Windows hosts
> [Using Ansible and Windows](windows_usage.md)
> Windows usage guide
> [Mailing List](https://groups.google.com/group/ansible-project)
> Questions? Help? Ideas? Stop by the list on Google Groups
> communication_irc
> How to join Ansible chat channels
