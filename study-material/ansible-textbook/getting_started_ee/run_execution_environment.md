---
title: Running your EE
product: ansible
source_url: https://docs.ansible.com/ansible/latest/getting_started_ee/run_execution_environment.html
source_path: ansible/ansible-documentation:docs/docsite/rst/getting_started_ee/run_execution_environment.rst
---

# Running your EE

You can run your EE on the command line against `localhost` or a remote target using `ansible-navigator`.


> [!NOTE]
>
> There are other tools besides `ansible-navigator` you can run EEs with.


## Run against localhost

1.  Create a `test_localhost.yml` playbook.

    yaml/test_localhost.yml

2.  Run the playbook inside the `postgresql_ee` EE.

    ``` bash
    ansible-navigator run test_localhost.yml --execution-environment-image postgresql_ee --mode stdout --pull-policy missing
    ```

You may notice the facts being gathered are about the container and not the developer machine.
This is because the ansible playbook was run inside the container.

## Run against a remote target

Before you start, ensure you have the following:

> - At least one IP address or resolvable hostname for a remote target.
> - Valid credentials for the remote host.
> - A user with <span class="title-ref">sudo</span> permissions on the remote host.

Execute a playbook inside the `postgresql_ee` EE against a remote host machine as in the following example:

1.  Create a directory for inventory files.

    ``` bash
    mkdir inventory
    ```

2.  Create the `hosts.yml` inventory file in the `inventory` directory.

    yaml/hosts.yml

3.  Create a `test_remote.yml` playbook.

    yaml/test_remote.yml

4.  Run the playbook inside the `postgresql_ee` EE.

    Replace `student` with the appropriate username.
    Some arguments in the command can be optional depending on your target host authentication method.

    ``` bash
    ansible-navigator run test_remote.yml -i inventory --execution-environment-image postgresql_ee:latest --mode stdout --pull-policy missing --enable-prompts -u student -k -K
    ```


> [!NOTE]
>
> See also
> [Execution Environment Definition](https://ansible-builder.readthedocs.io/en/stable/definition/)
> Provides information about the about Execution Environment definition file and available options.
> [Ansible Builder CLI usage](https://ansible-builder.readthedocs.io/en/stable/usage/)
> Provides details about using Ansible Builder.
> [Ansible Navigator documentation](https://ansible-navigator.readthedocs.io/)
> Provides details about using Ansible Navigator.
> [Running a local container registry for EEs](https://forum.ansible.com/t/running-local-container-registry-for-execution-environments/206)
> This guide in the Ansible community forum explains how to set up a local registry for your Execution Environment images.
